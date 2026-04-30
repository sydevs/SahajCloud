import type { CollectionConfig } from 'payload'

import type { RuleDefinition } from '@/fields'
import { rulesField } from '@/fields'

/**
 * Single source of truth for the rule dimensions an Audience can target.
 * Consumed by Audiences itself and by the for-audience endpoints to derive
 * their query schemas — add a rule here and both sides pick it up.
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
    description: 'Lifetime count of distinct lectures or lecture clips the user has played.',
  },
]

export const Audiences: CollectionConfig = {
  slug: 'audiences',
  labels: {
    singular: 'Audience',
    plural: 'Audiences',
  },
  admin: {
    group: 'Metadata',
    useAsTitle: 'label',
    defaultColumns: ['label', 'lectures', 'appCards'],
  },
  fields: [
    // Internal CMS label (not localized, not public-facing)
    {
      name: 'label',
      type: 'text',
      required: true,
    },
    // Targeting rules for user progress-based filtering
    ...rulesField({ rules: AUDIENCE_DEFINITIONS }),
    // Bidirectional join to lectures
    {
      name: 'lectures',
      type: 'join',
      collection: 'lectures',
      on: 'audiences',
      defaultLimit: 100,
      admin: {
        components: {
          Cell: {
            path: '@/components/admin/RelationshipCountCell',
            serverProps: { disableLink: true },
          },
        },
      },
    },
    // Bidirectional join to app cards
    {
      name: 'appCards',
      type: 'join',
      collection: 'app-cards',
      on: 'audiences',
      defaultLimit: 100,
      admin: {
        components: {
          Cell: {
            path: '@/components/admin/RelationshipCountCell',
            serverProps: { disableLink: true },
          },
        },
      },
    },
  ],
}
