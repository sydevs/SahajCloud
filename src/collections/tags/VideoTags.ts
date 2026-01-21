import type { CollectionConfig } from 'payload'

import { slugField } from '@/fields'

export const VideoTags: CollectionConfig = {
  slug: 'video-tags',
  labels: {
    singular: 'Video Tag',
    plural: 'Video Tags',
  },
  admin: {
    group: 'Metadata',
    useAsTitle: 'title',
    defaultColumns: ['title', 'videos'],
  },
  fields: [
    slugField({
      useAsSlug: 'title',
      description: 'URL-friendly identifier (auto-generated from {sourceField})',
    }),
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      admin: {
        description: 'This localized title will be shown to public users',
      },
    },
    {
      name: 'videos',
      type: 'join',
      collection: 'videos',
      on: 'tags',
      admin: {
        components: {
          Cell: '@/components/admin/RelationshipCountCell',
        },
      },
    },
  ],
}
