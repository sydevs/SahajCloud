import type { CollectionConfig } from 'payload'

import { UrlField } from '@/fields'
import { roleBasedAccess } from '@/lib/accessControl'

export const ExternalVideos: CollectionConfig = {
  slug: 'external-videos',
  access: roleBasedAccess('external-videos'),
  labels: {
    singular: 'External Video',
    plural: 'External Videos',
  },
  admin: {
    group: 'Resources',
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
