import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'

export const LessonUnits: CollectionConfig = {
  slug: 'lesson-units',
  access: permissionBasedAccess('lesson-units'),
  trash: true,
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'color', 'lessonCount', 'createdAt'],
  },
  hooks: {
    afterRead: [trackClientUsageHook],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: {
        description: 'The name of this lesson unit',
      },
    },
    {
      name: 'color',
      type: 'text',
      required: true,
      admin: {
        description: 'Theme color for this lesson unit (hex format, e.g., #FF0000)',
        placeholder: '#000000',
        components: {
          Field: {
            clientProps: {
              type: 'hex',
              expanded: false,
              showPreview: true,
            },
            path: '@nouance/payload-better-fields-plugin/ColourPicker/client#ColourPickerComponent',
          },
        },
      },
      validate: (value?: string) => {
        if (!value) return true
        const hexPattern = /^#[0-9A-Fa-f]{6}$/
        if (!hexPattern.test(value)) {
          return 'Color: Please enter a valid hex color (e.g., #FF0000)'
        }
        return true
      },
    },
    {
      name: 'lessonCount',
      type: 'number',
      virtual: true,
      hooks: {
        afterRead: [
          async ({ data, req }) => {
            if (!data?.id) return 0
            const lessons = await req.payload.find({
              collection: 'lessons',
              where: { unit: { equals: data.id } },
              limit: 0,
            })
            return lessons.totalDocs
          },
        ],
      },
      admin: {
        readOnly: true,
        description: 'Number of lessons in this unit',
        position: 'sidebar',
      },
    },
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
}