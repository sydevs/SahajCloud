import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'

export const MeditationTags: CollectionConfig = {
  slug: 'meditation-tags',
  access: permissionBasedAccess('meditations'),
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
      name: 'meditations',
      type: 'join',
      collection: 'meditations',
      on: 'tags',
    },
  ],
}
