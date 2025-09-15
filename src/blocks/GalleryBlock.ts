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
      localized: true,
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
          label: 'Articles',
          value: 'articles',
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
      maxRows: 10,
      relationTo: ['media', 'meditations', 'articles'],
      validate: ((value: unknown) => {
        if (!value) return true
        
        if (Array.isArray(value) && value.length > 10) {
          return 'Maximum 10 items allowed'
        }
        
        return true
      }) as Validate,
      admin: {
        description: 'Select items to display in gallery (max 10)',
        condition: (_, siblingData) => Boolean(siblingData?.collectionType),
      },
    },
  ],
}