import type { CollectionConfig } from 'payload'

import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { GENDER_OPTIONS } from '@/lib/data'
import { createRateLimitHook } from '@/lib/rateLimiting'

export const Narrators: CollectionConfig = {
  slug: 'narrators',
  admin: {
    group: 'Metadata',
    useAsTitle: 'name',
  },
  hooks: {
    beforeOperation: [createRateLimitHook()],
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
