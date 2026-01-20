import type { CollectionConfig } from 'payload'

import { slugField } from '@/fields'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { createRateLimitHook } from '@/lib/rateLimiting'

export const PageTags: CollectionConfig = {
  slug: 'page-tags',
  labels: {
    singular: 'Page Category',
    plural: 'Page Categories',
  },
  admin: {
    group: 'Metadata',
    useAsTitle: 'title',
    defaultColumns: ['title', 'pages'],
  },
  hooks: {
    beforeOperation: [createRateLimitHook()],
    afterRead: [trackClientUsageHook],
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
      name: 'pages',
      type: 'join',
      collection: 'pages',
      on: 'tags',
      admin: {
        components: {
          Cell: '@/components/admin/RelationshipCountCell',
        },
      },
    },
  ],
}
