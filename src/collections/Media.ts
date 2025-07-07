import type { CollectionConfig } from 'payload'
import { getStorageConfig } from '@/lib/storage'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: getStorageConfig(),
}
