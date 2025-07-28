import type { CollectionConfig } from 'payload'
import { readApiAccess } from '@/lib/accessControl'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'

export const Narrators: CollectionConfig = {
  slug: 'narrators',
  access: readApiAccess(),
  admin: {
    group: 'Utility',
    useAsTitle: 'name',
  },
  hooks: {
    afterRead: [trackClientUsageHook],
    beforeChange: [
      ({ data, operation }) => {
        if (operation === 'create' || (operation === 'update' && data.name)) {
          if (data.name && !data.slug) {
            data.slug = data.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '')
          }
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'gender',
      type: 'select',
      options: [
        {
          label: 'Male',
          value: 'male',
        },
        {
          label: 'Female',
          value: 'female',
        },
      ],
    },
  ],
}