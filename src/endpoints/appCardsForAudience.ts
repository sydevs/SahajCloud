import type { Endpoint } from 'payload'

import { z } from 'zod'

import { AUDIENCE_DEFINITIONS } from '@/collections/tags/Audiences'
import { buildAudienceDataShape, evaluateRules, type RulesValue } from '@/fields'
import { weightedSample } from '@/lib/weightedSample'
import type { AppCard, Audience } from '@/payload-types'

const querySchema = z.object({
  ...buildAudienceDataShape(AUDIENCE_DEFINITIONS),
  targetSection: z.enum(['hero', 'highlights', 'lectures']),
  limit: z.coerce.number().int().min(1).max(20),
})

/**
 * GET /api/app-cards/for-audience
 *
 * Returns a randomized, filtered list of published AppCards for the app
 * homepage (Hero or Highlights section). Audience evaluation is delegated to
 * the `audiences` docs referenced by each card's `audiences` hasMany
 * relationship. The endpoint first evaluates all audiences against the
 * supplied audience-data keys and then finds AppCards whose audience
 * relationship overlaps that eligible audience set (OR semantics). Cards with
 * empty `audiences` are always excluded. Eligible cards are then sampled with
 * weighted random selection (without replacement) based on the card's `weight`
 * field.
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

    const { docs: audienceDocs } = await req.payload.find({
      collection: 'audiences',
      // Safety cap. Assumes audience count stays well below this; if it ever
      // approaches 200, introduce pagination and evaluate the full audience set.
      limit: 200,
      depth: 0,
      pagination: false,
      req,
    })

    const eligibleAudienceIds = new Set<number>(
      (audienceDocs as Audience[])
        .filter((audience) =>
          evaluateRules(
            audience.rules as RulesValue | null | undefined,
            audienceData,
            AUDIENCE_DEFINITIONS,
          ),
        )
        .map((audience) => audience.id),
    )

    if (eligibleAudienceIds.size === 0) {
      return Response.json({ docs: [] })
    }

    const { docs } = await req.payload.find({
      collection: 'app-cards',
      where: {
        _status: { equals: 'published' },
        audiences: { in: [...eligibleAudienceIds] },
      },
      // Safety cap. Assumes published cards stay well below this; if it ever
      // approaches 200, introduce server-side filtering or pagination instead
      // of bumping the limit (a larger set biases the sample when truncated).
      limit: 200,
      depth: 1,
      pagination: false,
      req,
    })

    const eligible = (docs as AppCard[]).filter((card) =>
      Boolean(card.targetSections?.includes(targetSection)),
    )

    const selected = weightedSample(eligible, limit, (card) => card.weight ?? 3)

    return Response.json({ docs: selected })
  },
}
