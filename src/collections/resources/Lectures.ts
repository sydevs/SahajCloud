import type { CollectionConfig } from 'payload'

import { mediaField, urlField } from '@/fields'
import { populateFromNirmalaVidya } from '@/hooks/lectureHooks'

export const Lectures: CollectionConfig = {
  slug: 'lectures',
  labels: {
    singular: 'Lecture',
    plural: 'Lectures',
  },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'thumbnail'],
  },
  hooks: {
    beforeChange: [populateFromNirmalaVidya],
  },
  fields: [
    urlField({
      name: 'nirmalVidyaVimeoUrl',
      required: true,
      admin: {
        description: 'Paste the Vimeo URL from amruta.org (e.g. https://vimeo.com/123456789).',
      },
    }),
    {
      name: 'title',
      type: 'text',
      required: false, // Hook satisfies this on create; validated on update via condition
      localized: true,
      admin: {
        // Hidden during create — the hook auto-populates this field
        condition: (data) => !!data?.id,
        description: 'Auto-populated from Nirmala Vidya. Can be edited after creation.',
      },
    },
    mediaField({
      name: 'thumbnail',
      required: true,
      admin: {
        // Hidden during create — the hook auto-downloads and sets this field
        condition: (data) => !!data?.id,
      },
    }),
    urlField({
      name: 'videoUrl',
      required: true,
      admin: {
        readOnly: true,
        condition: (data) => !!data?.id,
        description: 'HLS stream URL',
      },
    }),
    urlField({
      name: 'subtitlesUrl',
      admin: {
        condition: (data) => !!data?.id,
      },
    }),
  ],
}
