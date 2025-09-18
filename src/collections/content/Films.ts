import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'
import { UrlField } from '@/fields'

export const Films: CollectionConfig = {
  slug: 'films',
  access: permissionBasedAccess('videos'),
  labels: {
    singular: 'Video',
    plural: 'Videos',
  },
  admin: {
    group: 'Content',
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
      name: 'thumbnail',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    UrlField({
      name: 'videoUrl',
      required: true,
    }),
  ],
}
