import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'

export const MediaTags: CollectionConfig = {
  slug: 'media-tags',
  access: permissionBasedAccess('frames'),
  admin: {
    group: 'Tags',
    useAsTitle: 'name',
    hidden: true,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'media',
      type: 'join',
      collection: 'media',
      on: 'tags',
    },
  ],
}
