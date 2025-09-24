import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { ColourTextField } from '@nouance/payload-better-fields-plugin/ColourText'
import { FileAttachmentField } from '@/fields'

export const LessonUnits: CollectionConfig = {
  slug: 'lesson-units',
  access: permissionBasedAccess('lessons'),
  trash: true,
  labels: {
    singular: 'Path Step',
    plural: 'Path Steps',
  },
  defaultSort: 'position',
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'color', 'position'],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: {
        position: 'sidebar',
      },
    },
    ...ColourTextField({
      name: 'color',
      required: true,
      admin: {
        position: 'sidebar',
      },
    }),
    {
      name: 'position',
      type: 'number',
      required: true,
      min: 1,
      admin: {
        position: 'sidebar',
        step: 1,
      },
    },
    {
      name: 'steps',
      type: 'array',
      fields: [
        {
          name: 'lesson',
          type: 'relationship',
          relationTo: 'lessons',
        },
        FileAttachmentField({
          name: 'icon',
          ownerCollection: 'lesson-units',
          required: true,
          fileType: 'image',
        }),
      ],
    },
  ],
  hooks: {
    afterRead: [trackClientUsageHook],
  },
}
