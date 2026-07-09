import type { Endpoint } from 'payload'

import { z } from 'zod'

import { audiencesQueryParamSchema } from '@/lib/audiences/audiencesQueryParam'
import { parseQuery, requireActiveClient } from '@/lib/endpoints'
import { weightedSample } from '@/lib/utilities/weightedSample'
import type { AppCard } from '@/payload-types'
import { CUSTOM_READS, publicReadCacheHeaders } from '@/plugins/cache'
import { asTrustedReq } from '@/plugins/usage/hooks'

const querySchema = z.object({
  audiences: audiencesQueryParamSchema,
  targetSection: z.enum(['hero', 'highlights', 'lectures']),
  limit: z.coerce.number().int().min(1).max(20),
})

/**
 * GET /api/app-cards/for-audience
 *
 * Returns a randomized, filtered list of published AppCards targeting the
 * requested `targetSection`, filtered down to cards whose `audiences`
 * relationship overlaps the supplied `audiences` ID list (OR semantics),
 * and whose `conditions` relationship is a subset of that ID list (AND semantics).
 *
 * Audience eligibility is **not** evaluated here — clients are expected to
 * call `/api/audiences/for-user` once to resolve their eligible audience
 * IDs and pass the result back as the `audiences` query param. Splitting
 * the rule eval out keeps this endpoint cacheable behind Cloudflare's edge
 * (see #340, #345).
 *
 * Note: `countdown` schedule evaluation is not yet applied here — cards with
 * `countdown: true` are returned regardless of whether the schedule is
 * currently active. Tracked as follow-up work.
 */
export const appCardsForAudience: Endpoint = {
  path: '/for-audience',
  method: 'get',
  handler: async (req) => {
    const denied = requireActiveClient(req)
    if (denied) return denied

    const parsed = parseQuery(req, querySchema)
    if (!parsed.ok) return parsed.response

    const { audiences: audienceIds, targetSection, limit } = parsed.data
    const { docs } = await req.payload.find({
      collection: 'app-cards',
      where: {
        _status: { equals: 'published' },
        audiences: { in: audienceIds },
      },
      // Safety cap. Assumes published cards stay well below this; if it ever
      // approaches 200, introduce server-side filtering or pagination instead
      // of bumping the limit (a larger set biases the sample when truncated).
      limit: 200,
      depth: 1,
      pagination: false,
      req: asTrustedReq(req),
    })

    const eligible = (docs as AppCard[]).filter((card) => {
      if (!card.targetSections?.includes(targetSection)) return false
      // Conditions gate: ALL conditions on the card must be in the supplied audienceIds
      // (AND semantics). Cards with no conditions pass automatically.
      const conditions = card.conditions as Array<number | { id: number }> | null | undefined
      if (conditions && conditions.length > 0) {
        const conditionIds = conditions.map((c) => (typeof c === 'number' ? c : c.id))
        if (!conditionIds.every((id) => audienceIds.includes(id))) return false
      }
      return true
    })

    const selected = weightedSample(eligible, limit, (card) => card.weight ?? 3)

    return Response.json(
      { docs: selected },
      {
        headers: publicReadCacheHeaders(req, CUSTOM_READS.appCardsForAudience),
      },
    )
  },
}
