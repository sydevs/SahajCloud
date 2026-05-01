import type { Endpoint, Where } from 'payload'

import { z } from 'zod'

import { recomputeWeightsForMeditation } from '@/hooks/meditationHooks'
import { audiencesQueryParamSchema } from '@/lib/audiences/audiencesQueryParam'
import { shapeLecture, type LecturePlayerData } from '@/lib/lectureShape'
import type { Lecture, Meditation, SubtleSystemNode } from '@/payload-types'

const querySchema = z.object({
  audiences: audiencesQueryParamSchema,
  limit: z.coerce.number().int().min(1).max(100),
  userChoice: z.coerce.number().int().optional(),
  excludedLectureIds: z
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
 * GET /api/meditations/:id/related-lectures
 *
 * Returns lectures contextually relevant to a specific meditation, ranked by
 * topical overlap between the meditation's on-screen subtle system nodes
 * (cached on `meditation.subtleSystemNodeWeights`) and each candidate
 * lecture's own `subtleSystemNodes`.
 *
 * Audience eligibility is **not** evaluated here — clients are expected to
 * call `/api/audiences/for-user` once to resolve their eligible audience
 * IDs and pass the result back as the `audiences` query param. Splitting
 * the rule eval out keeps this endpoint cacheable behind Cloudflare's edge
 * (see #340).
 *
 * Query params:
 *   - `audiences` (required, comma-separated IDs) — resolved audience IDs
 *     from `/api/audiences/for-user`. Server dedupes + sorts so equivalent
 *     client requests share an edge-cache key.
 *   - `limit` (required, 1–100)
 *   - `userChoice` (optional int) — if set, restrict candidates to lectures
 *     whose own `userChoices` contain that ID.
 *   - `excludedLectureIds` (optional comma-separated ints) — lectures to
 *     exclude (typically already-watched).
 *
 * Pipeline:
 *   1. Look up the meditation (404 if not found).
 *   2. Read `subtleSystemNodeWeights` from the cache; fall through to an
 *      ad-hoc compute (no persistence — keeps the GET side-effect-free).
 *   3. Find candidate lectures whose `audiences` overlap the requested
 *      list, with optional userChoice + excluded-id filters.
 *   4. Compute lecture weight = sum of `weights[node.slug]` over each
 *      populated `subtleSystemNodes` entry on the lecture. By default, drop
 *      zero-weight lectures (no relevance signal). When `userChoice` is set,
 *      keep zero-weight lectures — the user-choice match is itself a
 *      sufficient relevance signal (#333).
 *   5. Sort descending by weight; tie-break by id ascending → deterministic.
 *      Zero-weight lectures (only present when `userChoice` is set) sort
 *      after positive-weight ones and order among themselves by id ascending.
 *   6. Slice to `limit` and shape into `LecturePlayerData`.
 */
export const meditationLectures: Endpoint = {
  path: '/:id/related-lectures',
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

    const { audiences: audienceIds, limit, userChoice, excludedLectureIds } = parsed.data

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

    const lectureWhere: Where = {
      audiences: { in: audienceIds },
    }
    if (excludedLectureIds.length > 0) {
      lectureWhere.id = { not_in: excludedLectureIds }
    }
    if (typeof userChoice === 'number') {
      lectureWhere.userChoices = { in: [userChoice] }
    }

    const { docs: lectureDocs } = await req.payload.find({
      collection: 'lectures',
      where: lectureWhere,
      limit: 0,
      // depth: 2 so a clip's `fullLecture` is populated as a Lecture object
      // — clips have `metadata: null` and source it from their parent.
      depth: 2,
      pagination: false,
      locale: req.locale ?? 'en',
      req,
    })

    const eligibleLectures = lectureDocs as Lecture[]
    if (eligibleLectures.length === 0) {
      return Response.json(
        { docs: [] },
        { headers: { 'Cache-Control': 'public, max-age=600, s-maxage=600' } },
      )
    }

    type WeightedLecture = { lecture: Lecture; weight: number }
    const weighted: WeightedLecture[] = []

    for (const lecture of eligibleLectures) {
      const nodes = (lecture.subtleSystemNodes ?? []) as Array<number | SubtleSystemNode>
      let weight = 0
      for (const node of nodes) {
        if (node && typeof node === 'object' && typeof node.slug === 'string') {
          weight += weights[node.slug] ?? 0
        }
      }
      // userChoice match is itself a sufficient relevance signal (#333)
      if (weight <= 0 && userChoice === undefined) continue
      weighted.push({ lecture, weight })
    }

    weighted.sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight
      return a.lecture.id - b.lecture.id
    })

    const sliced = weighted.slice(0, limit)

    const shaped: LecturePlayerData[] = sliced
      .map(({ lecture }): LecturePlayerData | null => shapeLecture(lecture, req.payload.logger))
      .filter((item): item is LecturePlayerData => item !== null)

    return Response.json(
      { docs: shaped },
      { headers: { 'Cache-Control': 'public, max-age=600, s-maxage=600' } },
    )
  },
}
