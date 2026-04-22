import type { CollectionConfig } from 'payload'

import type { RuleDefinition } from '@/fields'
import { rulesField } from '@/fields'

/**
 * Single source of truth for the rule dimensions an Audience can target.
 * Consumed by Audiences itself and by the for-audience endpoints to derive
 * their query schemas — add a rule here and both sides pick it up.
 */
export const AUDIENCE_DEFINITIONS: RuleDefinition[] = [
  { name: 'pathProgress', type: 'range' },
  { name: 'meditationsPerWeek', type: 'range' },
  { name: 'totalMeditationsViewed', type: 'range' },
  { name: 'totalLecturesViewed', type: 'range' },
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
    defaultColumns: ['label', 'lectures', 'lectureClips', 'appCards'],
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
    // Bidirectional join to lecture clips
    {
      name: 'lectureClips',
      type: 'join',
      collection: 'lecture-clips',
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
