import type { CollectionConfig } from 'payload'

import { rulesField } from '@/fields'

export const LectureTags: CollectionConfig = {
  slug: 'lecture-tags',
  labels: {
    singular: 'Lecture Tag',
    plural: 'Lecture Tags',
  },
  admin: {
    group: 'Metadata',
    useAsTitle: 'label',
    defaultColumns: ['label', 'lectures'],
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
        { name: 'totalMeditationsViewed', type: 'range' },
        { name: 'totalLecturesViewed', type: 'range' },
      ],
    }),
    // Bidirectional join to lectures
    {
      name: 'lectures',
      type: 'join',
      collection: 'lectures',
      on: 'tags',
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
