import type { Endpoint } from 'payload'

import { z } from 'zod'

import { AUDIENCE_DEFINITIONS } from '@/collections/tags/Audiences'
import { buildAudienceDataShape, withAudienceContext } from '@/fields'
import { weightedSample } from '@/lib/weightedSample'
import type { AppCard, Audience } from '@/payload-types'

const querySchema = z.object({
  ...buildAudienceDataShape(AUDIENCE_DEFINITIONS),
  targetSection: z.enum(['hero', 'highlights']),
  limit: z.coerce.number().int().min(1).max(20),
})

/**
 * GET /api/app-cards/for-audience
 *
 * Returns a randomized, filtered list of published AppCards for the app
 * homepage (Hero or Highlights section). Audience evaluation is delegated to
 * the `audiences` docs referenced by each card's `audiences` hasMany
 * relationship — the endpoint stashes the audience data on
 * `req.context[AUDIENCE_DATA_CONTEXT_KEY]` and populates `audiences` at
 * depth:1, so the virtual `isEligibleForAudience` flag is computed on each
 * populated audience. A card is included when ANY of its attached audiences
 * passes (OR semantics). Cards with empty `audiences` are always excluded.
 * Eligible cards are then sampled with weighted random selection (without
 * replacement) based on the card's `weight` field.
 *
 * Note: `countdown` schedule evaluation is not yet applied here — cards with
 * `countdown: true` are returned regardless of whether the schedule is
 * currently active. Tracked as follow-up work.
 */
export const appCardsForAudience: Endpoint = {
  path: '/for-audience',
  method: 'get',
  handler: async (req) => {
    const parsed = querySchema.safeParse(req.query)

    if (!parsed.success) {
      return Response.json({ errors: parsed.error.issues }, { status: 400 })
    }

    const { targetSection, limit, ...audienceData } = parsed.data

    const { docs } = await req.payload.find({
      collection: 'app-cards',
      where: { _status: { equals: 'published' } },
      // Safety cap. Assumes published cards stay well below this; if it ever
      // approaches 200, introduce server-side filtering or pagination instead
      // of bumping the limit (a larger set biases the sample when truncated).
      limit: 200,
      depth: 1,
      pagination: false,
      // Thread user/transaction context so rate-limit and usage-tracking hooks
      // fire against the authenticated client, plus pass the audience data so
      // each populated `audiences[].isEligibleForAudience` virtual field
      // evaluates against it.
      req: withAudienceContext(req, audienceData),
    })

    const eligible = (docs as AppCard[]).filter((card) => {
      if (!card.targetSections?.includes(targetSection)) return false
      const audiences = card.audiences
      if (!Array.isArray(audiences) || audiences.length === 0) return false
      // OR semantics: card is eligible when ANY attached audience passes.
      return audiences.some(
        (audience) =>
          audience !== null &&
          typeof audience === 'object' &&
          (audience as Audience).isEligibleForAudience === true,
      )
    })

    const selected = weightedSample(eligible, limit, (card) => card.weight ?? 3)

    return Response.json({ docs: selected })
  },
}
