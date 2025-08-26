import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { GENDER_OPTIONS } from '@/lib/data'
import { generateSlug } from '@/lib/fieldUtils'

export const Narrators: CollectionConfig = {
  slug: 'narrators',
  access: permissionBasedAccess('meditations'),
  admin: {
    group: 'Resources',
    useAsTitle: 'name',
    hidden: true,
  },
  hooks: {
    afterRead: [trackClientUsageHook],
    beforeChange: [generateSlug],
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
