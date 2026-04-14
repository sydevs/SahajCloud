import type { Endpoint } from 'payload'

import { z } from 'zod'

import { evaluateRules, type UserRuleInputs } from '@/lib/appCards/evaluateRules'
import { weightedSample } from '@/lib/appCards/weightedSample'
import type { AppCard } from '@/payload-types'

const booleanQueryParam = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'))

const querySchema = z.object({
  targetSection: z.enum(['hero', 'highlights']),
  limit: z.coerce.number().int().min(1).max(20),
  hasRealization: booleanQueryParam,
  pathProgress: z.coerce.number().optional(),
  meditationsPerWeek: z.coerce.number().optional(),
  totalMeditationsViewed: z.coerce.number().optional(),
  totalLecturesViewed: z.coerce.number().optional(),
})

const DEFAULT_WEIGHT = 3

/**
 * GET /api/app-cards/for-user
 *
 * Returns a randomized, filtered list of published AppCards for the app
 * homepage (Hero or Highlights section). Cards are filtered by their
 * `targetSections` and `rules` JSON, then sampled with weighted random
 * selection (without replacement) based on the card's `weight` field.
 *
 * Note: `countdown` schedule evaluation is not yet applied here — cards with
 * `countdown: true` are returned regardless of whether the schedule is
 * currently active. Tracked as follow-up work.
 */
export const appCardsForUser: Endpoint = {
  path: '/for-user',
  method: 'get',
  handler: async (req) => {
    const parsed = querySchema.safeParse(req.query)

    if (!parsed.success) {
      return Response.json({ errors: parsed.error.issues }, { status: 400 })
    }

    const {
      targetSection,
      limit,
      hasRealization,
      pathProgress,
      meditationsPerWeek,
      totalMeditationsViewed,
      totalLecturesViewed,
    } = parsed.data

    const inputs: UserRuleInputs = {
      hasRealization,
      pathProgress,
      meditationsPerWeek,
      totalMeditationsViewed,
      totalLecturesViewed,
    }

    const { docs } = await req.payload.find({
      collection: 'app-cards',
      where: { _status: { equals: 'published' } },
      limit: 200,
      depth: 1,
      pagination: false,
    })

    const eligible = (docs as AppCard[]).filter((card) => {
      if (!card.targetSections?.includes(targetSection)) return false
      return evaluateRules(card.rules, inputs)
    })

    const selected = weightedSample(
      eligible,
      limit,
      (card) => card.weight ?? DEFAULT_WEIGHT,
    )

    return Response.json({ docs: selected })
  },
}
