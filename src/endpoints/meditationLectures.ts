import type { Endpoint, Where } from 'payload'

import { extractID } from 'payload/shared'
import { z } from 'zod'

import { AUDIENCE_DEFINITIONS } from '@/collections/tags/Audiences'
import { buildAudienceDataShape, evaluateRules, type RulesValue } from '@/fields'
import type { LectureMetadata } from '@/hooks/lectureHooks'
import { recomputeWeightsForMeditation } from '@/hooks/meditationHooks'
import {
  mergeSubtitles,
  resolveThumbnailUrl,
  type LectureClipPlayerData,
} from '@/lib/lectureClipShape'
import type { Audience, Lecture, LectureClip, Meditation, SubtleSystemNode } from '@/payload-types'

const querySchema = z.object({
  ...buildAudienceDataShape(AUDIENCE_DEFINITIONS),
  limit: z.coerce.number().int().min(1).max(100),
  userChoice: z.coerce.number().int().optional(),
  excludedLectureClipIds: z
    .string()
    .optional()
    .transform((s) => {
      if (!s) return [] as number[]
      return s
        .split(',')
        .map((part) => part.trim())
        .filter((part) => /^\d+$/.test(part))
        .map((part) => parseInt(part, 10))
    }),
})

/**
 * GET /api/meditations/:id/related-lecture-clips
 *
 * Returns lecture clips contextually relevant to a specific meditation,
 * ranked by topical overlap between the meditation's on-screen subtle
 * system nodes (cached on `meditation.subtleSystemNodeWeights`) and each
 * candidate clip's own `subtleSystemNodes`.
 *
 * Query params:
 *   - audience inputs (required, mirrors `/for-audience` endpoints)
 *   - `limit` (required, 1–100)
 *   - `userChoice` (optional int) — if set, restrict candidates to clips
 *     whose parent lecture has that user-choice in its `userChoices`.
 *   - `excludedLectureClipIds` (optional comma-separated ints) — clips to
 *     exclude (typically already-watched).
 *
 * Pipeline:
 *   1. Look up the meditation (404 if not found).
 *   2. Read `subtleSystemNodeWeights` from the cache; if missing, compute
 *      ad-hoc without persisting (the migration backfills + the afterChange
 *      hooks keep the cache fresh — keeping the GET side-effect-free).
 *   3. Evaluate audiences → eligible-audience-ID set; empty → `{ docs: [] }`.
 *   4. Resolve eligible parent lecture IDs (only when `userChoice` is set).
 *   5. Find candidate clips with audience + optional userChoice + optional
 *      excluded-id filters; bulk-fetch parent lectures for the result so
 *      we have the player metadata (hlsUrl, thumbnail, subtitles).
 *   6. Compute clip weight = sum of `weights[node.slug]` over each
 *      populated `subtleSystemNodes` entry on the clip itself; drop
 *      weight = 0 (clips with no nodes contribute nothing).
 *   7. Sort descending by weight; tie-break by clip id ascending →
 *      deterministic order.
 *   8. Slice to `limit`.
 *   9. Shape into `LectureClipPlayerData` (reuses helpers from
 *      `src/lib/lectureClipShape.ts`).
 */
export const meditationLectures: Endpoint = {
  path: '/:id/related-lecture-clips',
  method: 'get',
  handler: async (req) => {
    const idParam = req.routeParams?.id as string | number | undefined
    if (idParam === undefined || idParam === null || idParam === '') {
      return Response.json({ errors: [{ message: 'Meditation ID required' }] }, { status: 400 })
    }

    const parsed = querySchema.safeParse(req.query)
    if (!parsed.success) {
      return Response.json({ errors: parsed.error.issues }, { status: 400 })
    }

    const { limit, userChoice, excludedLectureClipIds, ...audienceData } = parsed.data

    let meditation: Meditation | null = null
    try {
      meditation = (await req.payload.findByID({
        collection: 'meditations',
        id: idParam,
        depth: 0,
        req,
      })) as Meditation
    } catch (err) {
      req.payload.logger.error({
        msg: 'meditationLectures: findByID threw — treating as not found',
        meditationId: idParam,
        error: err instanceof Error ? err.message : String(err),
      })
      meditation = null
    }
    if (!meditation) {
      return Response.json({ errors: [{ message: 'Meditation not found' }] }, { status: 404 })
    }

    // Cached weights are populated by the migration backfill and kept fresh by
    // the Meditations/Frames afterChange hooks. Falling through to an ad-hoc
    // compute covers any unbackfilled row without mutating state from a GET.
    const cachedWeights = meditation.subtleSystemNodeWeights as
      | Record<string, number>
      | null
      | undefined
    const weights =
      cachedWeights ?? (await recomputeWeightsForMeditation(req.payload, meditation, req))

    const { docs: audienceDocs } = await req.payload.find({
      collection: 'audiences',
      limit: 200,
      depth: 0,
      pagination: false,
      req,
    })

    const eligibleAudienceIds = new Set<number>(
      (audienceDocs as Audience[])
        .filter((audience) =>
          evaluateRules(
            audience.rules as RulesValue | null | undefined,
            audienceData,
            AUDIENCE_DEFINITIONS,
          ),
        )
        .map((audience) => audience.id),
    )

    if (eligibleAudienceIds.size === 0) {
      return Response.json({ docs: [] })
    }

    let gatedLectureIds: number[] | null = null
    if (typeof userChoice === 'number') {
      const { docs: gatedLectures } = await req.payload.find({
        collection: 'lectures',
        where: { userChoices: { in: [userChoice] } },
        limit: 0,
        pagination: false,
        depth: 0,
        req,
      })
      gatedLectureIds = (gatedLectures as Lecture[]).map((l) => l.id)
      if (gatedLectureIds.length === 0) {
        return Response.json({ docs: [] })
      }
    }

    const clipWhere: Where = {
      audiences: { in: [...eligibleAudienceIds] },
    }
    if (excludedLectureClipIds.length > 0) {
      clipWhere.id = { not_in: excludedLectureClipIds }
    }
    if (gatedLectureIds) {
      clipWhere.lecture = { in: gatedLectureIds }
    }

    const { docs: clipDocs } = await req.payload.find({
      collection: 'lecture-clips',
      where: clipWhere,
      limit: 0,
      depth: 1,
      pagination: false,
      locale: req.locale ?? 'en',
      req,
    })

    const eligibleClips = clipDocs as LectureClip[]
    if (eligibleClips.length === 0) {
      return Response.json({ docs: [] })
    }

    const clipsWithParentId: Array<{ clip: LectureClip; parentId: number }> = []
    const parentIds = new Set<number>()
    for (const clip of eligibleClips) {
      const pid = extractID(clip.lecture)
      if (typeof pid !== 'number') continue
      clipsWithParentId.push({ clip, parentId: pid })
      parentIds.add(pid)
    }

    const parentById = new Map<number, Lecture>()
    if (parentIds.size > 0) {
      const { docs: parents } = await req.payload.find({
        collection: 'lectures',
        where: { id: { in: [...parentIds] } },
        limit: parentIds.size,
        depth: 1,
        pagination: false,
        locale: req.locale ?? 'en',
        req,
      })
      for (const parent of parents as Lecture[]) {
        parentById.set(parent.id, parent)
      }
    }

    type WeightedClip = { clip: LectureClip; parent: Lecture; weight: number }
    const weighted: WeightedClip[] = []

    for (const { clip, parentId } of clipsWithParentId) {
      const parent = parentById.get(parentId)
      if (!parent) continue

      const nodes = (clip.subtleSystemNodes ?? []) as Array<number | SubtleSystemNode>
      let weight = 0
      for (const node of nodes) {
        if (node && typeof node === 'object' && typeof node.slug === 'string') {
          weight += weights[node.slug] ?? 0
        }
      }
      if (weight <= 0) continue

      weighted.push({ clip, parent, weight })
    }

    weighted.sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight
      return a.clip.id - b.clip.id
    })

    const sliced = weighted.slice(0, limit)

    const shaped: LectureClipPlayerData[] = sliced
      .map(({ clip, parent }): LectureClipPlayerData | null => {
        const metadata = parent.metadata as LectureMetadata | null | undefined
        if (!metadata?.hlsUrl) {
          req.payload.logger.warn({
            msg: 'Clip parent missing metadata.hlsUrl — skipping in /meditations/:id/related-lecture-clips',
            clipId: clip.id,
            parentId: parent.id,
          })
          return null
        }
        return {
          id: clip.id,
          type: 'lecture-clip',
          title: clip.title,
          hlsUrl: metadata.hlsUrl,
          thumbnailUrl: resolveThumbnailUrl({
            primaryOverride: clip.thumbnail,
            secondaryOverride: parent.thumbnail,
            fallback: metadata.thumbnailUrl,
          }),
          subtitles: mergeSubtitles(metadata.subtitles, clip.subtitles),
          startTime: clip.startTime,
          endTime: clip.endTime,
          duration: clip.endTime - clip.startTime,
          lectureId: parent.id,
        }
      })
      .filter((item): item is LectureClipPlayerData => item !== null)

    return Response.json({ docs: shaped })
  },
}
