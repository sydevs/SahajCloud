import type { Endpoint } from 'payload'

import { Temporal } from '@js-temporal/polyfill'
import { z } from 'zod'

import { isEventInUserDaytime } from '@/lib/audiences/daytimeMatch'
import { isScheduleActiveNow } from '@/lib/audiences/scheduleMatch'
import type { ScheduleSubFields } from '@/types/schedule'

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
  // Context params (optional — required for context audiences that use those fields)
  country: z.string().length(2).optional(),
  timezone: z.string().optional(),
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
 * progress data and optional context (country, timezone). Returns combined
 * matching progress + context audience IDs.
 *
 * Progress audiences: evaluated via a single SQL WHERE query.
 * Context audiences: fetched all, then JS-filtered by country/schedule/eventTime.
 *
 * Clients call this once per state change and pass the result to the
 * `/for-audience` data endpoints, which skip rule eval and are more cacheable.
 * See #340 for the split rationale; #345 for the context audience extension.
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
    const now = new Date()
    const nowInstant = Temporal.Instant.from(now.toISOString())

    // ── Progress audiences: single SQL WHERE query ─────────────────────────
    const progressResult = await req.payload.find({
      collection: 'audiences',
      where: {
        and: [{ type: { equals: 'progress' } }, buildProgressWhereClause(params)],
      },
      depth: 0,
      limit: 200,
      pagination: false,
      req,
    })

    const progressIds: number[] = progressResult.docs.map((a) => a.id)

    // ── Context audiences: fetch-all + JS filter ──────────────────────────
    const conditionResult = await req.payload.find({
      collection: 'audiences',
      where: { type: { equals: 'context' } },
      depth: 1,
      limit: 200,
      pagination: false,
      req,
    })

    const conditionIds: number[] = conditionResult.docs
      .filter((audience) => {
        // Country gate: empty list = pass for any user; otherwise country must match
        const countryList = audience.country as string[] | null | undefined
        if (countryList && countryList.length > 0) {
          if (!params.country || !countryList.includes(params.country)) return false
        }

        // Schedule gate: requires timezone; if firstDate is set, occurrence must be active
        const schedule = audience.schedule as Partial<ScheduleSubFields> | null | undefined
        if (schedule?.firstDate) {
          if (!params.timezone) return false
          if (!isScheduleActiveNow({ schedule, now })) return false
        }

        // EventTime gate: requires timezone; local hour must be in [08:00, 22:00)
        const eventTime = audience.eventTime as string | null | undefined
        const eventTimeTz = audience.eventTime_tz as string | null | undefined
        if (eventTime) {
          if (!params.timezone || !eventTimeTz) return false
          if (
            !isEventInUserDaytime({
              eventTime,
              eventTimeTz,
              userTimezone: params.timezone,
              now: nowInstant,
            })
          )
            return false
        }

        return true
      })
      .map((a) => a.id)

    // ── Combine, dedup, sort ascending (stable cache keys) ────────────────
    const audienceIds = [...new Set([...progressIds, ...conditionIds])].sort((a, b) => a - b)

    return Response.json(
      { audiences: audienceIds },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } },
    )
  },
}
