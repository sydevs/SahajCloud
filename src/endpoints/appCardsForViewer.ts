import type { Endpoint } from 'payload'

import { z } from 'zod'

import { VIEWER_DATA_CONTEXT_KEY } from '@/fields/rulesField'
import { weightedSample } from '@/lib/weightedSample'
import type { AppCard, ViewerRule } from '@/payload-types'

const querySchema = z.object({
  targetSection: z.enum(['hero', 'highlights']),
  limit: z.coerce.number().int().min(1).max(20),
  pathProgress: z.coerce.number().optional(),
  meditationsPerWeek: z.coerce.number().optional(),
  totalMeditationsViewed: z.coerce.number().optional(),
  totalLecturesViewed: z.coerce.number().optional(),
})

/**
 * GET /api/app-cards/for-viewer
 *
 * Returns a randomized, filtered list of published AppCards for the app
 * homepage (Hero or Highlights section). Rule evaluation is delegated to the
 * `viewer-rules` doc referenced by each card's `audience` relationship — the
 * endpoint stashes the viewer data on `req.context[VIEWER_DATA_CONTEXT_KEY]`
 * and populates `audience` at depth:1, so the virtual `isEligibleForViewer`
 * flag is computed on the populated rule. Cards with `audience: null` are
 * always excluded. Eligible cards are then sampled with weighted random
 * selection (without replacement) based on the card's `weight` field.
 *
 * Note: `countdown` schedule evaluation is not yet applied here — cards with
 * `countdown: true` are returned regardless of whether the schedule is
 * currently active. Tracked as follow-up work.
 */
export const appCardsForViewer: Endpoint = {
  path: '/for-viewer',
  method: 'get',
  handler: async (req) => {
    const parsed = querySchema.safeParse(req.query)

    if (!parsed.success) {
      return Response.json({ errors: parsed.error.issues }, { status: 400 })
    }

    const { targetSection, limit, ...viewerData } = parsed.data

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
      // fire against the authenticated client, plus pass the viewer data so
      // the populated `audience.isEligibleForViewer` virtual field evaluates
      // against it.
      req: {
        ...req,
        context: { ...req.context, [VIEWER_DATA_CONTEXT_KEY]: viewerData },
      },
    })

    const eligible = (docs as AppCard[]).filter((card) => {
      if (!card.targetSections?.includes(targetSection)) return false
      const audience = card.audience
      if (!audience || typeof audience !== 'object') return false
      return (audience as ViewerRule).isEligibleForViewer === true
    })

    const selected = weightedSample(eligible, limit, (card) => card.weight ?? 3)

    return Response.json({ docs: selected })
  },
}
