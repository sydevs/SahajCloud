import type { Endpoint } from 'payload'

import { z } from 'zod'

import { audiencesQueryParamSchema } from '@/lib/audiences/audiencesQueryParam'
import { parseQuery, publicReadCacheHeaders, requireActiveClient } from '@/lib/endpoints'
import { selectAudienceFeed } from '@/lib/lectures/audienceFeed'
import { LECTURE_FEED_SELECT } from '@/lib/lectures/lectureShape'
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
    const denied = requireActiveClient(req)
    if (denied) return denied

    const parsed = parseQuery(req, querySchema)
    if (!parsed.ok) return parsed.response

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
      // Bounded to the feed-shape fields so the `clips` join afterRead never
      // fires across the pool (#541).
      select: LECTURE_FEED_SELECT,
      req: asTrustedReq(req),
    })

    const docs = selectAudienceFeed({
      lectures: lectureDocs as Lecture[],
      limit,
      eligibleAudienceIds: audienceIds,
      logger: req.payload.logger,
    })

    return Response.json(
      { docs },
      {
        headers: publicReadCacheHeaders(req, {
          sMaxAge: 600,
          tags: ['lectures', 'audiences'],
        }),
      },
    )
  },
}
