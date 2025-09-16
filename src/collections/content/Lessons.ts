import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'
import { trackClientUsageHook } from '@/jobs/tasks/TrackUsage'
import { sanitizeFilename, processFile, convertFile } from '@/lib/fieldUtils'
import type { FieldHook } from 'payload'

const validateOrderUniqueness: FieldHook = async ({ value, data, req }) => {
  if (value == null || !data?.unit) return value
  
  const existingLessons = await req.payload.find({
    collection: 'lessons',
    where: {
      and: [
        { unit: { equals: data.unit } },
        { order: { equals: value } },
        { id: { not_equals: data.id } },
      ],
    },
    limit: 1,
  })
  
  if (existingLessons.totalDocs > 0) {
    throw new Error(`Another lesson in this unit already has order ${value}`)
  }
  
  return value
}

export const Lessons: CollectionConfig = {
  slug: 'lessons',
  access: permissionBasedAccess('lessons'),
  trash: true,
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'unit', 'order', 'publishAt'],
    listSearchableFields: ['title'],
    defaultSort: 'order',
  },
  hooks: {
    afterRead: [trackClientUsageHook],
  },
  upload: {
    adminThumbnail: 'thumbnail',
    mimeTypes: ['audio/*'],
    disableLocalStorage: false,
    resizeOptions: undefined,
    crop: false,
    focalPoint: false,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: {
        description: 'The name of this lesson',
      },
    },
    {
      name: 'thumbnail',
      type: 'upload',
      relationTo: 'media',
      required: true,
      admin: {
        description: 'Visual thumbnail for the lesson',
      },
    },
    {
      name: 'color',
      type: 'text',
      required: true,
      admin: {
        description: 'Theme color for this lesson (hex format, e.g., #FF0000)',
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
      validate: (value: string) => {
        if (!value) return true
        const hexPattern = /^#[0-9A-Fa-f]{6}$/
        if (!hexPattern.test(value)) {
          return 'Please enter a valid hex color (e.g., #FF0000)'
        }
        return true
      },
    },
    {
      name: 'unit',
      type: 'relationship',
      relationTo: 'lesson-units',
      required: true,
      admin: {
        description: 'The unit this lesson belongs to',
      },
    },
    {
      name: 'order',
      type: 'number',
      required: true,
      min: 0,
      hooks: {
        beforeValidate: [validateOrderUniqueness],
      },
      admin: {
        description: 'Order within the unit (must be unique per unit)',
      },
    },
    {
      name: 'meditation',
      type: 'relationship',
      relationTo: 'meditations',
      required: false,
      admin: {
        description: 'Optional related guided meditation',
      },
    },
    {
      name: 'article',
      type: 'relationship',
      relationTo: 'pages',
      label: 'Deep Dive Article',
      required: false,
      admin: {
        description: 'Optional related article for deeper exploration of lesson topics',
      },
    },
    {
      name: 'panels',
      type: 'array',
      required: true,
      minRows: 1,
      admin: {
        description: 'Content panels for this lesson',
      },
      fields: [
        {
          name: 'title',
          type: 'text',
          required: true,
        },
        {
          name: 'text',
          type: 'text',
          required: true,
        },
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
      ],
    },
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
      name: 'filename',
      type: 'text',
      hooks: {
        beforeChange: [sanitizeFilename],
      },
      admin: {
        readOnly: true,
        hidden: true,
      },
    },
    {
      name: 'alt',
      type: 'text',
      admin: {
        hidden: true,
      },
    },
    {
      name: 'fileMetadata',
      type: 'json',
      admin: {
        readOnly: true,
        hidden: true,
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
  hooks: {
    beforeChange: [
      processFile({}),
      convertFile,
    ],
  },
}