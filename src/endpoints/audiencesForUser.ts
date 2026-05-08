import type { Endpoint } from 'payload'

import { z } from 'zod'

const PROGRESS_RULES = [
  'pathProgress',
  'meditationsPerWeek',
  'totalMeditationsViewed',
  'totalLecturesViewed',
] as const

const querySchema = z.object({
  // Progress params (all required; pass 0 as a neutral sentinel)
  pathProgress: z.coerce.number(),
  meditationsPerWeek: z.coerce.number(),
  totalMeditationsViewed: z.coerce.number(),
  totalLecturesViewed: z.coerce.number(),
  // Context params (always required)
  country: z.string().length(2),
})

type QueryParams = z.infer<typeof querySchema>

/**
 * Build the Payload WHERE clause that matches progress audiences whose
 * configured ranges contain the supplied value for each dimension.
 *
 * For each rule: OR(min not set, min ≤ value) AND OR(max not set, max ≥ value)
 * This implements "unset bound = always passes" with a single DB query.
 */
function buildProgressWhereClause(params: QueryParams) {
  const conditions = PROGRESS_RULES.map((rule) => {
    const value = params[rule]
    return {
      and: [
        {
          or: [
            { [`${rule}.min`]: { exists: false } },
            { [`${rule}.min`]: { less_than_equal: value } },
          ],
        },
        {
          or: [
            { [`${rule}.max`]: { exists: false } },
            { [`${rule}.max`]: { greater_than_equal: value } },
          ],
        },
      ],
    }
  })
  return { and: conditions }
}

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

    const params = parsed.data

    // ── Single query: progress WHERE clause + JS country filter ───────────
    const result = await req.payload.find({
      collection: 'audiences',
      where: buildProgressWhereClause(params),
      depth: 0,
      limit: 200,
      pagination: false,
      req,
    })

    const audienceIds = result.docs
      .filter((audience) => {
        const countryList = audience.country as string[] | null | undefined
        if (countryList && countryList.length > 0) {
          return countryList.includes(params.country)
        }
        return true
      })
      .map((a) => a.id)
      .sort((a, b) => a - b)

    return Response.json(
      { audiences: audienceIds },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } },
    )
  },
}
