import type { CollectionConfig } from 'payload'

import { slugField } from 'payload'

import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { roleBasedAccess } from '@/lib/accessControl'
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
      overrides: (field) => {
        if (field.fields[1].type === 'text') {
          field.fields[1].admin = {
            ...field.fields[1].admin,
            description: 'URL-friendly identifier (auto-generated from title)',
          }
        }
        return field
      },
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
