import type { Endpoint } from 'payload'

import { extractID } from 'payload/shared'
import { z } from 'zod'

import { VIEWER_RULE_DEFINITIONS } from '@/collections/tags/ViewerRules'
import { buildViewerDataShape, withViewerContext } from '@/fields'
import type { Lecture, LectureClip, ViewerRule } from '@/payload-types'

const querySchema = z.object({
  ...buildViewerDataShape(VIEWER_RULE_DEFINITIONS),
  limit: z.coerce.number().int().min(1).max(100),
})

/** Discriminated union returned from /for-viewer. */
type ViewerLecture = Lecture & { type: 'lecture' }
type ViewerClip = Omit<LectureClip, 'parent'> & {
  type: 'clip'
  /** Populated only when parent itself is audience-eligible; otherwise null. */
  parent: Lecture | null
}

/**
 * GET /api/lectures/for-viewer
 *
 * Returns a uniform-random, rule-filtered feed mixing full lectures and clips
 * for the supplied viewer data. Each lecture/clip carries a single `audience`
 * relationship to a `viewer-rules` doc. Items are eligible when their
 * `audience` is non-null and passes `rulesField` evaluation. Items with
 * `audience: null` are always excluded.
 *
 * Response shape:
 *   { docs: Array<{ type: 'lecture' | 'clip', ... }> }
 * Clips include a populated `parent` object only when the parent is itself
 * viewer-eligible; otherwise `parent: null`. Clips also get server-merged
 * `thumbnail` / `subtitlesUrl` fallbacks from their parent when empty,
 * regardless of whether the parent is returned.
 *
 * Pipeline:
 *   1. Evaluate `viewer-rules` with `viewerData` in `req.context` and build
 *      the eligible-rule set from the virtual `isEligibleForViewer` flag.
 *   2. Find lectures whose `audience` is in the eligible set.
 *   3. Find clips whose `audience` is in the eligible set.
 *   4. Bulk-fetch parent lectures needed for (a) `parent` population when
 *      eligible and (b) `thumbnail` / `subtitlesUrl` fallback. Single `find`
 *      with `id: { in: [...] }` — no N+1.
 *   5. Shape, concatenate, Fisher-Yates shuffle, slice to `limit`.
 *
 * Caveat: a no-arg call (`viewerData = {}`) fails every `range` rule, so only
 * items whose audience has empty/no configured rules will be returned.
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

    // Step 1 — evaluate viewer rules against viewer data.
    // Safety cap; if rule count ever approaches 200, introduce server-side
    // filtering or pagination — a larger set biases the sample when truncated.
    const { docs: ruleDocs } = await req.payload.find({
      collection: 'viewer-rules',
      limit: 200,
      depth: 0,
      pagination: false,
      // Thread user/transaction context so rate-limit and usage-tracking hooks
      // fire against the authenticated client, plus pass viewer data for the
      // virtual `isEligibleForViewer` field to evaluate against.
      req: withViewerContext(req, viewerData),
    })

    const eligibleRuleIds = new Set<number>(
      (ruleDocs as ViewerRule[])
        .filter((rule) => rule.isEligibleForViewer === true)
        .map((rule) => rule.id),
    )

    if (eligibleRuleIds.size === 0) {
      return Response.json({ docs: [] })
    }

    // Step 2 — candidate lectures whose audience is eligible. The DB filter
    // alone is sufficient now that `audience` is a single relationship — no
    // JS post-filter needed (unlike the pre-#293 `tags` hasMany model).
    // No _status filter — drafts removed from the Lectures collection in #291.
    // Per-sub-query limit keeps the shuffled pool ≤ 2× `limit` before slicing.
    const { docs: lectureDocs } = await req.payload.find({
      collection: 'lectures',
      where: { audience: { in: [...eligibleRuleIds] } },
      limit,
      depth: 1,
      pagination: false,
      req,
    })

    // Step 3 — candidate clips whose audience is eligible.
    const { docs: clipDocs } = await req.payload.find({
      collection: 'lecture-clips',
      where: { audience: { in: [...eligibleRuleIds] } },
      limit,
      depth: 1,
      pagination: false,
      req,
    })

    const eligibleLectures = lectureDocs as Lecture[]
    const eligibleClips = clipDocs as LectureClip[]

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
      const parentId = extractID(clip.parent)
      if (typeof parentId === 'number' && !parentById.has(parentId)) {
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
        req,
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
      const parentId = extractID(clip.parent)
      const parentDoc = typeof parentId === 'number' ? parentById.get(parentId) ?? null : null
      const parentVisible =
        typeof parentId === 'number' && eligibleLectureIds.has(parentId) && parentDoc !== null

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
