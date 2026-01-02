import type { CollectionConfig } from 'payload'

import { urlField } from '@/fields'

export const Lectures: CollectionConfig = {
  slug: 'lectures',
  labels: {
    singular: 'Lecture',
    plural: 'Lectures',
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
      relationTo: 'images',
      required: true,
    },
    urlField({
      name: 'videoUrl',
      required: true,
    }),
    urlField({
      name: 'subtitlesUrl',
    }),
  ],
}
