import type { Endpoint } from 'payload'

import { z } from 'zod'

import { audiencesQueryParamSchema } from '@/lib/audiences/audiencesQueryParam'
import { shapeLecture, type LecturePlayerData } from '@/lib/lectures/lectureShape'
import type { Lecture } from '@/payload-types'
import { asTrustedReq } from '@/plugins/usage/hooks'

const querySchema = z.object({
  audiences: audiencesQueryParamSchema,
  limit: z.coerce.number().int().min(1).max(100),
})

/**
 * GET /api/lectures/for-audience
 *
 * Returns a feed of lectures whose attached audiences overlap the supplied
 * `audiences` ID list. Items with empty `audiences` are always excluded.
 *
 * Lectures with `priority > 0` are always returned before the normal
 * random pool. Within the pinned group, lectures are sorted by priority
 * descending; ties are randomised. The normal pool (priority ≤ 0) preserves
 * the existing uniform-random behaviour.
 *
 * Audience eligibility is **not** evaluated here — clients are expected to
 * call `/api/audiences/for-user` once to resolve their eligible audience
 * IDs and pass the result back as the `audiences` query param. Splitting
 * the rule eval out keeps this endpoint cacheable behind Cloudflare's edge
 * (see #340).
 *
 * Response shape: `{ docs: LecturePlayerData[] }`. Subtitles are returned as
 * the full `{ [locale]: url }` map merged from NV metadata and per-locale
 * entries on the lecture's own `subtitles` array.
 */
export const lecturesForAudience: Endpoint = {
  path: '/for-audience',
  method: 'get',
  handler: async (req) => {
    if (req.user?.collection !== 'clients' || !req.user.active) {
      return Response.json(
        { errors: [{ message: 'You are not allowed to perform this action.' }] },
        { status: 403 },
      )
    }

    const parsed = querySchema.safeParse(req.query)

    if (!parsed.success) {
      return Response.json({ errors: parsed.error.issues }, { status: 400 })
    }

    const { audiences: audienceIds, limit } = parsed.data
    const { docs: lectureDocs } = await req.payload.find({
      collection: 'lectures',
      where: { audiences: { in: audienceIds } },
      // Fetch all eligible candidates so shuffles sample uniformly across
      // the entire pool, not just the first N rows by DB order.
      limit: 0,
      // depth: 2 so a clip's `fullLecture` is populated as a Lecture object
      // — clips have `metadata: null` and source it from their parent.
      depth: 2,
      pagination: false,
      req: asTrustedReq(req),
    })

    const eligibleLectures = lectureDocs as Lecture[]

    // Partition into pinned (priority > 0) and normal (priority ≤ 0 / unset) pools.
    // Partition on raw docs so `priority` is accessible before shaping.
    const pinnedRaw = eligibleLectures.filter((l) => (l.priority ?? 0) > 0)
    const normalRaw = eligibleLectures.filter((l) => (l.priority ?? 0) <= 0)

    function shapePool(lectures: Lecture[]): LecturePlayerData[] {
      return lectures
        .map((l): LecturePlayerData | null => shapeLecture(l, req.payload.logger, audienceIds))
        .filter((item): item is LecturePlayerData => item !== null)
    }

    // Pinned pool: build (priority, shaped) pairs, shuffle for tie-breaking,
    // then stable-sort descending by priority.
    const pinnedPairs = pinnedRaw
      .map((l) => ({
        priority: l.priority ?? 0,
        shaped: shapeLecture(l, req.payload.logger, audienceIds),
      }))
      .filter((p): p is { priority: number; shaped: LecturePlayerData } => p.shaped !== null)

    for (let i = pinnedPairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pinnedPairs[i], pinnedPairs[j]] = [pinnedPairs[j], pinnedPairs[i]]
    }
    pinnedPairs.sort((a, b) => b.priority - a.priority)
    const shapedPinned = pinnedPairs.map((p) => p.shaped)

    // Normal pool: existing Fisher-Yates shuffle
    const shapedNormal = shapePool(normalRaw)
    for (let i = shapedNormal.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shapedNormal[i], shapedNormal[j]] = [shapedNormal[j], shapedNormal[i]]
    }

    return Response.json(
      { docs: [...shapedPinned, ...shapedNormal].slice(0, limit) },
      { headers: { 'Cache-Control': 'public, max-age=600, s-maxage=600' } },
    )
  },
}
