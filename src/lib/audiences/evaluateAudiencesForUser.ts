import type { PayloadRequest } from 'payload'

import { evaluateRules, type AudienceData, type RulesValue } from '@/fields'
import { AUDIENCE_DEFINITIONS } from '@/lib/audiences/definitions'
import type { Audience } from '@/payload-types'

/**
 * Returns the IDs of every Audience whose stored `rules` evaluate to true
 * against the supplied `audienceData` (mirrors the `pathProgress`/
 * `meditationsPerWeek`/etc. shape produced by `buildAudienceDataShape`).
 *
 * Returned IDs are sorted ascending so the wire response from
 * `/api/audiences/for-user` is byte-stable across calls — useful for client
 * caching even though the endpoint itself isn't a strong cache candidate.
 *
 * Hardcoded `limit: 200` matches the legacy data-endpoint code paths this
 * helper replaced. If audience count ever approaches that, paginate here
 * instead of bumping the limit.
 */
export async function evaluateAudiencesForUser(
  req: PayloadRequest,
  audienceData: AudienceData,
): Promise<number[]> {
  const { docs } = await req.payload.find({
    collection: 'audiences',
    limit: 200,
    depth: 0,
    pagination: false,
    req,
  })

  return (docs as Audience[])
    .filter((audience) =>
      evaluateRules(
        audience.rules as RulesValue | null | undefined,
        audienceData,
        AUDIENCE_DEFINITIONS,
      ),
    )
    .map((audience) => audience.id)
    .sort((a, b) => a - b)
}
