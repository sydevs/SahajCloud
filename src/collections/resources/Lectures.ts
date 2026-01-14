import type { CollectionConfig } from 'payload'

import { mediaField, urlField } from '@/fields'

export const Lectures: CollectionConfig = {
  slug: 'lectures',
  labels: {
    singular: 'Lecture',
    plural: 'Lectures',
  },
  admin: {
    group: 'Resources',
    useAsTitle: 'title',
    defaultColumns: ['title', 'thumbnail'],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    mediaField({
      name: 'thumbnail',
      required: true,
    }),
    urlField({
      name: 'videoUrl',
      required: true,
    }),
    urlField({
      name: 'subtitlesUrl',
    }),
  ],
}
