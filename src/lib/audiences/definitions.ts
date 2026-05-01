import type { RuleDefinition } from '@/fields'

/**
 * Single source of truth for the rule dimensions an Audience can target.
 * Consumed by the Audiences collection schema, the audience-eval endpoints,
 * and the OpenAPI shim — add a rule here and all sides pick it up.
 *
 * Lives under `src/lib/audiences/` (rather than the Audiences collection
 * file itself) so the audiencesForUser endpoint can reference it without
 * creating a circular import: the Audiences collection registers the
 * endpoint, and the endpoint reads the definitions.
 */
export const AUDIENCE_DEFINITIONS: RuleDefinition[] = [
  {
    name: 'pathProgress',
    type: 'range',
    description: 'Index of the current Path step the user has reached (0 = not started).',
  },
  {
    name: 'meditationsPerWeek',
    type: 'range',
    description: 'Meditation sessions the user has completed in the past seven days.',
  },
  {
    name: 'totalMeditationsViewed',
    type: 'range',
    description: 'Lifetime count of distinct meditations the user has opened.',
  },
  {
    name: 'totalLecturesViewed',
    type: 'range',
    description: 'Lifetime count of distinct lectures the user has played.',
  },
]
