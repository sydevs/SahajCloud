import type { CollectionConfig } from 'payload'

export const ImageTags: CollectionConfig = {
  slug: 'image-tags',
  admin: {
    group: 'Metadata',
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'images',
      type: 'join',
      collection: 'images',
      on: 'tags',
    },
  ],
}
