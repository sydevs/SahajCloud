import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'

export const FrameTags: CollectionConfig = {
  slug: 'frame-tags',
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
      name: 'frames',
      type: 'join',
      collection: 'frames',
      on: 'tags',
    },
  ],
}
