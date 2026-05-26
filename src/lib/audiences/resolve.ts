import type { Where, BasePayload, PayloadRequest, TypedLocale } from 'payload'

const PROGRESS_RULES = [
  'pathProgress',
  'meditationsPerWeek',
  'totalMeditationsViewed',
  'totalLecturesViewed',
] as const

export type AudienceResolveParams = {
  pathProgress: number
  meditationsPerWeek: number
  totalMeditationsViewed: number
  totalLecturesViewed: number
  country: string
}

/**
 * Build the Payload WHERE clause that matches audiences whose
 * configured ranges contain the supplied value for each dimension.
 *
 * For each rule: OR(min not set, min ≤ value) AND OR(max not set, max ≥ value)
 * Unset bounds always pass.
 */
export function buildProgressWhereClause(params: AudienceResolveParams): Where {
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
 * Resolve the set of Audience IDs a user qualifies for given their
 * current progress data and country.
 *
 * Single DB query: progress-range WHERE clause applied to all audiences
 * (unset bounds always pass). Country gate applied in JS post-query
 * (empty list passes).
 */
export async function resolveAudienceIds(
  payload: BasePayload,
  params: AudienceResolveParams,
  req?: PayloadRequest,
): Promise<number[]> {
  const result = await payload.find({
    collection: 'audiences',
    where: buildProgressWhereClause(params),
    depth: 0,
    limit: 200,
    pagination: false,
    req,
  })

  return result.docs
    .filter((audience) => {
      const location = audience.location as { countries?: string[] | null } | null | undefined
      const countryList = location?.countries
      if (countryList && countryList.length > 0) {
        return countryList.includes(params.country)
      }
      return true
    })
    .map((a) => a.id)
    .sort((a, b) => a - b)
}

/**
 * Count lectures whose `audiences` overlaps the supplied audience ID list.
 *
 * Mirrors the audience filter used by `lecturesForAudience` (OR semantics
 * via `{ audiences: { in: [...] } }`) so Section 3 of the launch
 * readiness data model can produce a count without re-implementing the
 * filter. Pass `locale` to align with locale-aware collection hooks
 * where applicable.
 */
export async function countLecturesForAudiences(
  payload: BasePayload,
  args: { audiences: number[]; locale?: TypedLocale; req?: PayloadRequest },
): Promise<number> {
  if (args.audiences.length === 0) return 0
  const result = await payload.count({
    collection: 'lectures',
    where: { audiences: { in: args.audiences } },
    locale: args.locale,
    req: args.req,
  })
  return result.totalDocs
}
