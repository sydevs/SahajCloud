import type { Endpoint } from 'payload'

import { z } from 'zod'

import { audiencesQueryParamSchema } from '@/lib/audiences/audiencesQueryParam'
import { parseQuery, requireActiveClient } from '@/lib/endpoints'
import { weightedSample } from '@/lib/utilities/weightedSample'
import type { AppCard, AppCardsSelect } from '@/payload-types'
import { publicReadCacheHeaders } from '@/plugins/cache'
import { asTrustedReq } from '@/plugins/usage/hooks'

/**
 * Bounded select for app-card candidates: all fields except expensive
 * virtual fields like `viewSchedule` that would fire per-row (#560).
 * Destination relationships (page/lecture/album/meditation) are populated
 * at depth: 1 but their expensive virtual fields are gated by their
 * respective `defaultPopulate` (see Pages.defaultPopulate, etc.).
 */
const APP_CARD_SELECT: AppCardsSelect<true> = {
  label: true,
  type: true,
  targetSections: true,
  weight: true,
  timings: true,
  audiences: true,
  conditions: true,
  // View configuration tabs: all non-virtual fields
  default: {
    header: true,
    title: true,
    subtitle: true,
    buttonText: true,
    buttonIcon: true,
    destination: true,
    page: true,
    lecture: true,
    album: true,
    meditation: true,
    url: true,
    image: true,
    aspectRatio: true,
    textColor: true,
    alignment: true,
  },
  startingSoon: {
    enabled: true,
    threshold: true,
    header: true,
    title: true,
    subtitle: true,
    buttonText: true,
    buttonIcon: true,
    destination: true,
    page: true,
    lecture: true,
    album: true,
    meditation: true,
    url: true,
    image: true,
    aspectRatio: true,
    textColor: true,
    alignment: true,
  },
  liveNow: {
    enabled: true,
    threshold: true,
    header: true,
    title: true,
    subtitle: true,
    buttonText: true,
    buttonIcon: true,
    destination: true,
    page: true,
    lecture: true,
    album: true,
    meditation: true,
    url: true,
    image: true,
    aspectRatio: true,
    textColor: true,
    alignment: true,
  },
} satisfies AppCardsSelect<true>

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
      // Bounded to non-virtual fields so expensive per-row afterReads never
      // fire across the pool. Destination relationships populate but their
      // expensive fields are gated by defaultPopulate on target collections (#560).
      select: APP_CARD_SELECT,
      req: asTrustedReq(req),
    })

    const audienceIdSet = new Set(audienceIds)
    const eligible = (docs as AppCard[]).filter((card) => {
      if (!card.targetSections?.includes(targetSection)) return false
      // Conditions gate: ALL conditions on the card must be in the supplied audienceIds
      // (AND semantics). Cards with no conditions pass automatically.
      const conditions = card.conditions as Array<number | { id: number }> | null | undefined
      if (conditions && conditions.length > 0) {
        const conditionIds = conditions.map((c) => (typeof c === 'number' ? c : c.id))
        if (!conditionIds.every((id) => audienceIdSet.has(id))) return false
      }
      return true
    })

    const selected = weightedSample(eligible, limit, (card) => card.weight ?? 3)

    return Response.json(
      { docs: selected },
      {
        headers: publicReadCacheHeaders(req, ['app-cards', 'audiences']),
      },
    )
  },
}
