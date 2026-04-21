import type { CollectionConfig } from 'payload'

import { lecturesForViewer } from '@/endpoints'
import { mediaField, urlField } from '@/fields'
import { populateFromNirmalaVidya, populateSubtitleLocales } from '@/hooks/lectureHooks'

export const Lectures: CollectionConfig = {
  slug: 'lectures',
  labels: {
    singular: 'Lecture',
    plural: 'Lectures',
  },
  endpoints: [lecturesForViewer],
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'thumbnail'],
  },
  hooks: {
    beforeChange: [populateFromNirmalaVidya],
    afterChange: [populateSubtitleLocales],
  },
  fields: [
    urlField({
      name: 'nirmalVidyaVimeoUrl',
      required: true,
      admin: {
        description: 'Paste the Vimeo URL from amruta.org (e.g. https://vimeo.com/123456789).',
      },
      access: {
        // Vimeo URL is immutable after creation
        update: () => false,
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
    {
      name: 'subtitlesUrl',
      type: 'text',
      localized: true,
      admin: {
        readOnly: true,
        condition: (data) => !!data?.id,
        description: 'VTT subtitle URL — auto-populated from Nirmala Vidya API per locale.',
      },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'lecture-tags',
      hasMany: true,
      admin: {
        description:
          'Tags control visibility in listings and indexes. A lecture with no tags will never appear in any listing — it will only be shown when directly referenced from a meditation or path step.',
      },
    },
    {
      name: 'clips',
      type: 'join',
      collection: 'lecture-clips',
      on: 'parent',
      admin: {
        allowCreate: true,
        defaultColumns: ['title', 'startTime', 'endTime', 'tags'],
      },
    },
  ],
}
