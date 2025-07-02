import type { CollectionConfig } from 'payload'

export const Meditations: CollectionConfig = {
  slug: 'meditations',
  admin: {
    useAsTitle: 'title',
  },
  hooks: {
    beforeChange: [
      ({ data, operation, originalDoc }) => {
        if (operation === 'create' && data.title) {
          // Always generate slug on create, ignore any provided slug
          data.slug = data.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
        } else if (operation === 'update' && originalDoc) {
          // Preserve original slug on update
          data.slug = originalDoc.slug
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'duration',
      type: 'number',
      min: 1,
      admin: {
        description: 'Duration in minutes',
        position: 'sidebar',
      },
    },
    {
      name: 'thumbnail',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'audioFile',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'narrator',
      type: 'relationship',
      relationTo: 'narrators',
      required: true,
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
    },
    {
      name: 'musicTag',
      type: 'relationship',
      relationTo: 'tags',
      admin: {
        description: 'Music with this tag will be offered to the seeker',
      },
    },
    {
      name: 'isPublished',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'publishedDate',
      type: 'date',
      admin: {
        position: 'sidebar',
        date: {
          pickerAppearance: 'dayOnly',
        },
      },
    },
  ],
}