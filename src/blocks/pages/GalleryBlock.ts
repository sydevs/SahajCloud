import { Block, Validate } from 'payload'

export const GalleryBlock: Block = {
  slug: 'gallery',
  labels: {
    singular: 'Gallery',
    plural: 'Galleries',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      admin: {
        description: 'Optional title for this gallery',
      },
    },
    {
      name: 'collectionType',
      type: 'select',
      required: true,
      options: [
        {
          label: 'Media',
          value: 'media',
        },
        {
          label: 'Meditations',
          value: 'meditations',
        },
        {
          label: 'Pages',
          value: 'pages',
        },
      ],
      admin: {
        description: 'Type of collection to display in gallery',
      },
    },
    {
      name: 'items',
      type: 'relationship',
      hasMany: true,
      maxRows: 15,
      relationTo: ['media', 'meditations', 'pages'],
      validate: ((value: unknown) => {
        if (!value) return true

        if (Array.isArray(value) && value.length > 15) {
          return 'Maximum 15 items allowed'
        }

        return true
      }) as Validate,
      admin: {
        description: 'Select items to display in gallery (max 15)',
        condition: (_, siblingData) => Boolean(siblingData?.collectionType),
      },
    },
  ],
}