import type { Endpoint } from 'payload'

import { z } from 'zod'

import { VIEWER_DATA_CONTEXT_KEY } from '@/fields/rulesField'
import { SKIP_CLIENT_QUERY_VALIDATION_KEY } from '@/lib/usage/constants'
import type { Lecture, LectureClip, LectureTag } from '@/payload-types'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100),
  pathProgress: z.coerce.number().optional(),
  totalMeditationsViewed: z.coerce.number().optional(),
  totalLecturesViewed: z.coerce.number().optional(),
})

type LectureRef = number | Lecture
type TagRef = number | LectureTag

/** Discriminated union returned from /for-viewer. */
type ViewerLecture = Lecture & { type: 'lecture' }
type ViewerClip = Omit<LectureClip, 'parent'> & {
  type: 'clip'
  /** Populated only when parent itself is tag-eligible; otherwise null. */
  parent: Lecture | null
}

function idOf(ref: unknown): number | null {
  if (typeof ref === 'number') return ref
  if (typeof ref === 'object' && ref !== null && 'id' in ref) {
    const id = (ref as { id: unknown }).id
    return typeof id === 'number' ? id : null
  }
  return null
}

function allTagsEligible(
  tags: TagRef[] | null | undefined,
  eligibleSet: Set<number>,
): boolean {
  if (!tags || tags.length === 0) return false
  return tags.every((t) => {
    const id = idOf(t)
    return id !== null && eligibleSet.has(id)
  })
}

/**
 * GET /api/lectures/for-viewer
 *
 * Returns a uniform-random, rule-filtered feed mixing full lectures and clips
 * for the supplied viewer data. Unlike AppCards, lectures/clips carry no rules
 * themselves — rules live on `lecture-tags`. A lecture or clip is eligible if
 * it has at least one tag and **all** of its tags pass `rulesField` evaluation
 * for the viewer. Untagged items are always excluded.
 *
 * Response shape (breaking change from pre-#291):
 *   { docs: Array<{ type: 'lecture' | 'clip', ... }> }
 * Clips include a populated `parent` object only when the parent is itself
 * viewer-eligible; otherwise `parent: null`. Clips also get server-merged
 * `thumbnail` / `subtitlesUrl` fallbacks from their parent when empty,
 * regardless of whether the parent is returned.
 *
 * Pipeline:
 *   1. Evaluate `lecture-tags` with `viewerData` in `req.context` and build
 *      the eligible-tag set from the virtual `isEligibleForViewer` flag.
 *   2. Find lectures with at least one eligible tag; JS-filter all-tags-pass.
 *   3. Find clips with at least one eligible tag; JS-filter all-tags-pass.
 *   4. Bulk-fetch parent lectures needed for (a) `parent` population when
 *      eligible and (b) `thumbnail` / `subtitlesUrl` fallback. Single `find`
 *      with `id: { in: [...] }` — no N+1.
 *   5. Shape, concatenate, Fisher-Yates shuffle, slice to `limit`.
 *
 * Caveat: a no-arg call (`viewerData = {}`) fails every `range` rule, so only
 * items whose tags all have empty/no configured rules will be returned.
 * Empty rules always match — see `rulesField.ts`.
 */
export const lecturesForViewer: Endpoint = {
  path: '/for-viewer',
  method: 'get',
  handler: async (req) => {
    const parsed = querySchema.safeParse(req.query)

    if (!parsed.success) {
      return Response.json({ errors: parsed.error.issues }, { status: 400 })
    }

    const { limit, ...viewerData } = parsed.data

    // Trusted internal req — keeps client identity for rate-limit/usage tracking
    // but opts out of the client query-param validation hook so internal calls
    // don't need to enumerate `select` for every field.
    const trustedReq = {
      ...req,
      context: { ...req.context, [SKIP_CLIENT_QUERY_VALIDATION_KEY]: true },
    }

    // Step 1 — evaluate tags against viewer data.
    // Safety cap; see pre-#291 rationale. If tag count ever approaches 200,
    // introduce server-side filtering or pagination — a larger set biases the
    // sample when truncated.
    const { docs: tagDocs } = await req.payload.find({
      collection: 'lecture-tags',
      limit: 200,
      depth: 0,
      pagination: false,
      // Thread user/transaction context so rate-limit and usage-tracking hooks
      // fire against the authenticated client, plus pass viewer data for the
      // virtual `isEligibleForViewer` field to evaluate against.
      req: {
        ...trustedReq,
        context: { ...trustedReq.context, [VIEWER_DATA_CONTEXT_KEY]: viewerData },
      },
    })

    const eligibleTagSet = new Set<number>(
      (tagDocs as LectureTag[])
        .filter((tag) => tag.isEligibleForViewer === true)
        .map((tag) => tag.id),
    )

    if (eligibleTagSet.size === 0) {
      return Response.json({ docs: [] })
    }

    const eligibleTagIds = [...eligibleTagSet]

    // Step 2 — candidate lectures with at least one eligible tag.
    // Per-sub-query limit keeps the shuffled pool ≤ 2× `limit` before slicing.
    // No _status filter — drafts removed from the Lectures collection in #291.
    const { docs: lectureDocs } = await req.payload.find({
      collection: 'lectures',
      where: { tags: { in: eligibleTagIds } },
      limit,
      depth: 1,
      pagination: false,
      req: trustedReq,
    })

    // Step 3 — candidate clips with at least one eligible tag.
    const { docs: clipDocs } = await req.payload.find({
      collection: 'lecture-clips',
      where: { tags: { in: eligibleTagIds } },
      limit,
      depth: 1,
      pagination: false,
      req: trustedReq,
    })

    // Step 2/3 — enforce all-tags-pass. Payload's `in` matches any-tag on
    // hasMany, and depth:1 may return populated tag objects, so accept both
    // shapes.
    const eligibleLectures = (lectureDocs as Lecture[]).filter((l) =>
      allTagsEligible(l.tags as TagRef[] | null | undefined, eligibleTagSet),
    )

    const eligibleClips = (clipDocs as LectureClip[]).filter((c) =>
      allTagsEligible(c.tags as TagRef[] | null | undefined, eligibleTagSet),
    )

    // Step 4 — bulk-fetch parents for clips. Need parents for:
    //   (a) `parent` population when the parent is itself viewer-eligible
    //   (b) `thumbnail` / `subtitlesUrl` fallback (regardless of eligibility)
    // Seed the cache from `eligibleLectures` first (they were already fetched at
    // depth:1 in step 2) and only query for parents we don't yet have. Saves a
    // round-trip when a clip's parent is itself viewer-eligible.
    const eligibleLectureIds = new Set<number>(eligibleLectures.map((l) => l.id))

    const parentById = new Map<number, Lecture>()
    for (const lecture of eligibleLectures) {
      parentById.set(lecture.id, lecture)
    }

    const parentIdsToFetch = new Set<number>()
    for (const clip of eligibleClips) {
      const parentId = idOf(clip.parent as LectureRef | null | undefined)
      if (parentId !== null && !parentById.has(parentId)) {
        parentIdsToFetch.add(parentId)
      }
    }

    if (parentIdsToFetch.size > 0) {
      const { docs: parentDocs } = await req.payload.find({
        collection: 'lectures',
        where: { id: { in: [...parentIdsToFetch] } },
        limit: parentIdsToFetch.size,
        depth: 1,
        pagination: false,
        req: trustedReq,
      })
      for (const parent of parentDocs as Lecture[]) {
        parentById.set(parent.id, parent)
      }
    }

    // Step 5 — shape into discriminated union.
    const shapedLectures: ViewerLecture[] = eligibleLectures.map((l) => ({
      ...l,
      type: 'lecture',
    }))

    const shapedClips: ViewerClip[] = eligibleClips.map((clip) => {
      const parentId = idOf(clip.parent as LectureRef | null | undefined)
      const parentDoc = parentId !== null ? parentById.get(parentId) ?? null : null
      const parentVisible =
        parentId !== null && eligibleLectureIds.has(parentId) && parentDoc !== null

      // Fallback: merge parent's thumbnail / subtitlesUrl into the clip when
      // the clip's own value is empty. Runs regardless of whether `parent`
      // is returned — clients don't implement fallback logic.
      const thumbnail = clip.thumbnail ?? parentDoc?.thumbnail ?? null
      const subtitlesUrl = clip.subtitlesUrl ?? parentDoc?.subtitlesUrl ?? null

      return {
        ...clip,
        type: 'clip',
        thumbnail,
        subtitlesUrl,
        parent: parentVisible ? parentDoc : null,
      }
    })

    // Step 6 — concatenate, uniform Fisher-Yates shuffle, then slice.
    const combined: Array<ViewerLecture | ViewerClip> = [...shapedLectures, ...shapedClips]
    for (let i = combined.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[combined[i], combined[j]] = [combined[j], combined[i]]
    }

    return Response.json({ docs: combined.slice(0, limit) })
  },
}
