import type { CollectionConfig } from 'payload'

import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { roleBasedAccess } from '@/lib/accessControl'

export const PageTags: CollectionConfig = {
  slug: 'page-tags',
  access: roleBasedAccess('pages'),
  admin: {
    group: 'Tags',
    useAsTitle: 'name',
    hidden: true,
  },
  hooks: {
    afterRead: [trackClientUsageHook],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description: 'This label will be used in the editor',
      },
    },
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
    },
  ],
}
