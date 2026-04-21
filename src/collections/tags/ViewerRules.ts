import type { CollectionConfig } from 'payload'

import { rulesField } from '@/fields'

export const ViewerRules: CollectionConfig = {
  slug: 'viewer-rules',
  labels: {
    singular: 'Viewer Rule',
    plural: 'Viewer Rules',
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
    ...rulesField({
      rules: [
        { name: 'pathProgress', type: 'range' },
        { name: 'meditationsPerWeek', type: 'range' },
        { name: 'totalMeditationsViewed', type: 'range' },
        { name: 'totalLecturesViewed', type: 'range' },
      ],
    }),
    // Bidirectional join to lectures
    {
      name: 'lectures',
      type: 'join',
      collection: 'lectures',
      on: 'audience',
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
      on: 'audience',
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
      on: 'audience',
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
