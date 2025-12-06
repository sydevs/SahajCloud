import type { CollectionConfig } from 'payload'

import { roleBasedAccess } from '@/lib/accessControl'

export const ImageTags: CollectionConfig = {
  slug: 'image-tags',
  access: roleBasedAccess('images'),
  admin: {
    group: 'Tags',
    useAsTitle: 'title',
    hidden: true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'images',
      type: 'join',
      collection: 'images',
      on: 'tags',
    },
  ],
}
