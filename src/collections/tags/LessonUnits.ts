import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { ColourTextField } from '@nouance/payload-better-fields-plugin/ColourText'

export const LessonUnits: CollectionConfig = {
  slug: 'lesson-units',
  access: permissionBasedAccess('lessons'),
  trash: true,
  admin: {
    hidden: true,
    group: 'Tags',
    useAsTitle: 'title',
    defaultColumns: ['title', 'color', 'createdAt'],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    ...ColourTextField({
      name: 'color',
      required: true,
    }),
    {
      name: 'createdAt',
      type: 'date',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'updatedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
  hooks: {
    afterRead: [trackClientUsageHook],
  },
}
