import type { CollectionConfig } from 'payload'
import { permissionBasedAccess } from '@/lib/accessControl'
import { UrlField } from '@/fields'

export const ExternalVideos: CollectionConfig = {
  slug: 'external-videos',
  access: permissionBasedAccess('external-videos'),
  labels: {
    singular: 'External Video',
    plural: 'External Videos',
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
    UrlField({
      name: 'subtitlesUrl',
    }),
    {
      name: 'category',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Shri Mataji', value: 'shri-mataji' },
        { label: 'Techniques', value: 'techniques' },
        { label: 'Other', value: 'other' },
      ],
    },
  ],
}
