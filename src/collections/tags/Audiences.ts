import type { CollectionConfig } from 'payload'

import { audiencesForUser } from '@/endpoints'
import { rulesField } from '@/fields'
import { AUDIENCE_DEFINITIONS } from '@/lib/audiences/definitions'

// Re-exported so existing call sites can keep importing from this module
// (the canonical home is `@/lib/audiences/definitions` — see that file
// for the rationale).
export { AUDIENCE_DEFINITIONS }

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
  endpoints: [audiencesForUser],
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
