import type { Endpoint } from 'payload'

import { z } from 'zod'

import { buildAudienceDataShape } from '@/fields'
import { AUDIENCE_DEFINITIONS } from '@/lib/audiences/definitions'
import { evaluateAudiencesForUser } from '@/lib/audiences/evaluateAudiencesForUser'

const querySchema = z.object({
  ...buildAudienceDataShape(AUDIENCE_DEFINITIONS),
})

/**
 * GET /api/audiences/for-user
 *
 * Resolves the set of Audiences a user qualifies for given their current
 * progress data (path step, meditation/lecture counts, etc.). The three
 * `for-audience` data endpoints take this list as their `audiences` query
 * param so they can skip rule evaluation entirely and become cacheable —
 * see #340 for the split rationale.
 *
 * The response itself is only lightly cached (5 min) because rule inputs
 * are continuous integers and cache-key permutations explode quickly.
 */
export const audiencesForUser: Endpoint = {
  path: '/for-user',
  method: 'get',
  handler: async (req) => {
    const parsed = querySchema.safeParse(req.query)

    if (!parsed.success) {
      return Response.json({ errors: parsed.error.issues }, { status: 400 })
    }

    const audienceIds = await evaluateAudiencesForUser(req, parsed.data)

    return Response.json(
      { audiences: audienceIds },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } },
    )
  },
}
