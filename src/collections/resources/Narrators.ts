import type { CollectionConfig } from 'payload'

import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { GENDER_OPTIONS } from '@/lib/data'

export const Narrators: CollectionConfig = {
  slug: 'narrators',
  admin: {
    group: 'Resources',
    useAsTitle: 'name',
  },
  hooks: {
    afterRead: [trackClientUsageHook],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'gender',
      type: 'select',
      required: true,
      options: GENDER_OPTIONS,
    },
  ],
}
