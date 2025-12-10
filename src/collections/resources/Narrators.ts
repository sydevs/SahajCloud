import type { CollectionConfig } from 'payload'

import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { roleBasedAccess } from '@/lib/accessControl'
import { GENDER_OPTIONS } from '@/lib/data'
import { handleProjectVisibility } from '@/lib/projectVisibility'

export const Narrators: CollectionConfig = {
  slug: 'narrators',
  access: roleBasedAccess('meditations'),
  admin: {
    group: 'Resources',
    useAsTitle: 'name',
    hidden: handleProjectVisibility('narrators', ['wemeditate-app'], { excludeFromAdminView: true }),
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
