import type { CollectionConfig } from 'payload'

import { createRateLimitHook } from '@/lib/rateLimiting'

export const ImageTags: CollectionConfig = {
  slug: 'image-tags',
  hooks: {
    beforeOperation: [createRateLimitHook()],
  },
  admin: {
    group: 'Metadata',
    useAsTitle: 'title',
    defaultColumns: ['title', 'images'],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'images',
      type: 'join',
      collection: 'images',
      on: 'tags',
      admin: {
        components: {
          Cell: '@/components/admin/RelationshipCountCell',
        },
      },
    },
  ],
}
