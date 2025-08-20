import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'

export const MusicTags: CollectionConfig = {
  slug: 'music-tags',
  access: permissionBasedAccess('music'),
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
      admin: {
        description: 'This label will be used in the editor',
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      admin: {
        description: 'This localized title will be shown to public users',
      },
    },
    {
      name: 'music',
      type: 'join',
      collection: 'music',
      on: 'tags',
    },
  ],
}
