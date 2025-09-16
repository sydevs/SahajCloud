import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { ColourTextField } from '@nouance/payload-better-fields-plugin/ColourText'
import { MediaField } from '@/fields'

export const Lessons: CollectionConfig = {
  slug: 'lessons',
  access: permissionBasedAccess('lessons'),
  trash: true,
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'unit', 'order', 'publishAt'],
    listSearchableFields: ['title'],
  },
  upload: {
    staticDir: 'media/lessons',
    mimeTypes: ['audio/*'],
    crop: false,
    focalPoint: false,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'meditation',
      type: 'relationship',
      relationTo: 'meditations',
      required: false,
      admin: {
        description: 'Link to a related guided meditation that complements this lesson content.',
      },
    },
    {
      name: 'article',
      type: 'relationship',
      relationTo: 'pages',
      label: 'Deep Dive Article',
      required: false,
      admin: {
        description:
          'Link to a related article page that provides deeper exploration of the lesson topics and concepts.',
      },
    },
    {
      name: 'panels',
      type: 'array',
      required: true,
      minRows: 1,
      admin: {
        isSortable: true,
        description: 'Story panels to introduce this lesson.',
        components: {
          RowLabel: '@/components/admin/TitleRowLabel',
        },
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
          admin: {
            placeholder: 'e.g., Introduction, Main Teaching, Practice Exercise',
          },
        },
        {
          name: 'text',
          type: 'text',
          required: true,
          admin: {
            placeholder: 'Describe the content, instructions, or guidance for this section',
          },
        },
        MediaField({
          name: 'image',
          label: 'Background Image',
          required: true,
          orientation: 'portrait',
        }),
      ],
    },
    // ===== SIDEBAR FIELDS ===== //
    {
      name: 'publishAt',
      type: 'date',
      localized: true,
      admin: {
        position: 'sidebar',
        date: {
          pickerAppearance: 'dayOnly',
          minDate: new Date(),
        },
        components: {
          Cell: '@/components/admin/PublishStateCell',
          afterInput: ['@/components/admin/PublishAtAfterInput'],
        },
        description: 'Schedule when this lesson should be published',
      },
    },
    {
      type: 'row',
      admin: {
        position: 'sidebar',
      },
      fields: [
        {
          name: 'unit',
          type: 'relationship',
          relationTo: 'lesson-units',
          required: true,
          admin: {
            description:
              'Select the unit this lesson belongs to. Lessons are organized by units for better content structure.',
          },
        },
        {
          name: 'order',
          type: 'number',
          required: true,
          min: 0,
          admin: {
            description:
              'Numeric order within the selected unit. Each lesson must have a unique order number within its unit (e.g., 0, 1, 2...).',
            step: 1,
          },
        },
      ],
    },
    MediaField({
      name: 'icon',
      required: true,
      orientation: 'square',
      admin: {
        position: 'sidebar',
      },
    }),
    ...ColourTextField({
      name: 'color',
      required: true,
      admin: {
        position: 'sidebar',
      },
    }),
  ],
  hooks: {
    afterRead: [trackClientUsageHook],
  },
}
