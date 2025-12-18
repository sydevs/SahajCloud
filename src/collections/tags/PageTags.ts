import type { CollectionConfig } from 'payload'

import { slugField } from '@/fields'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { roleBasedAccess } from '@/lib/access'
import { handleProjectVisibility } from '@/lib/projectVisibility'

export const PageTags: CollectionConfig = {
  slug: 'page-tags',
  access: roleBasedAccess('pages'),
  labels: {
    singular: 'Page Category',
    plural: 'Page Categories',
  },
  admin: {
    group: 'Tags',
    useAsTitle: 'title',
    hidden: handleProjectVisibility('page-tags', ['wemeditate-web']),
  },
  hooks: {
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
    },
  ],
}
