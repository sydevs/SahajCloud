import type { Endpoint } from 'payload'

import { z } from 'zod'

import { audiencesQueryParamSchema } from '@/lib/audiences/audiencesQueryParam'
import { shapeLecture, type LecturePlayerData } from '@/lib/lectureShape'
import type { Lecture } from '@/payload-types'

const querySchema = z.object({
  audiences: audiencesQueryParamSchema,
  limit: z.coerce.number().int().min(1).max(100),
})

/**
 * GET /api/lectures/for-audience
 *
 * Returns a uniform-random feed of lectures whose attached audiences
 * overlap the supplied `audiences` ID list. Items with empty `audiences`
 * are always excluded.
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
    const parsed = querySchema.safeParse(req.query)

    if (!parsed.success) {
      return Response.json({ errors: parsed.error.issues }, { status: 400 })
    }

    const { audiences: audienceIds, limit } = parsed.data

    const { docs: lectureDocs } = await req.payload.find({
      collection: 'lectures',
      where: { audiences: { in: audienceIds } },
      // Fetch all eligible candidates so the Fisher-Yates shuffle below
      // samples uniformly across the entire pool, not just the first N
      // rows by DB order. Sliced down to `limit` after shuffling.
      limit: 0,
      // depth: 2 so a clip's `fullLecture` is populated as a Lecture object
      // — clips have `metadata: null` and source it from their parent.
      depth: 2,
      pagination: false,
      req,
    })

    const eligibleLectures = lectureDocs as Lecture[]

    const shaped: LecturePlayerData[] = eligibleLectures
      .map((lecture): LecturePlayerData | null => shapeLecture(lecture, req.payload.logger))
      .filter((item): item is LecturePlayerData => item !== null)

    // Fisher-Yates shuffle + slice
    for (let i = shaped.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shaped[i], shaped[j]] = [shaped[j], shaped[i]]
    }

    return Response.json(
      { docs: shaped.slice(0, limit) },
      { headers: { 'Cache-Control': 'public, max-age=600, s-maxage=600' } },
    )
  },
}
