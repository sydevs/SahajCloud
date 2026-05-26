import type { Endpoint } from 'payload'

import { z } from 'zod'

import { resolveAudienceIds } from '@/lib/audiences/resolve'
import { asTrustedReq } from '@/lib/usage/hooks'

const querySchema = z.object({
  // Progress params (all required; pass 0 as a neutral sentinel)
  pathProgress: z.coerce.number(),
  meditationsPerWeek: z.coerce.number(),
  totalMeditationsViewed: z.coerce.number(),
  totalLecturesViewed: z.coerce.number(),
  // Context params (always required)
  country: z.string().length(2),
})

/**
 * GET /api/audiences/for-user
 *
 * Resolves the set of Audiences a user qualifies for given their current
 * progress data and context (country). Returns matching audience IDs.
 *
 * Single query: progress-range WHERE clause applied to all audiences
 * (unset bounds always pass). Country gate applied in JS post-query
 * (empty list passes). All five query params (four progress + country) are required.
 *
 * Clients call this once per state change and pass the result to the
 * `/for-audience` data endpoints, which skip rule eval and are more cacheable.
 */
export const audiencesForUser: Endpoint = {
  path: '/for-user',
  method: 'get',
  handler: async (req) => {
    const parsed = querySchema.safeParse(req.query)

    if (!parsed.success) {
      return Response.json({ errors: parsed.error.issues }, { status: 400 })
    }

    const audienceIds = await resolveAudienceIds(req.payload, parsed.data, asTrustedReq(req))

    return Response.json(
      { audiences: audienceIds },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } },
    )
  },
}
