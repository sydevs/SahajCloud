import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'

export const MediaTags: CollectionConfig = {
  slug: 'media-tags',
  access: permissionBasedAccess('frames'),
  admin: {
    group: 'Tags',
    useAsTitle: 'label',
    hidden: true,
  },
  fields: [
    {
      name: 'label',
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
