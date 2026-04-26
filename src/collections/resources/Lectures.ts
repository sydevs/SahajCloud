import type { CollectionConfig } from 'payload'

import { lecturesForAudience } from '@/endpoints'
import { mediaField, urlField } from '@/fields'
import { deleteChildren } from '@/hooks/cascadeDeletion'
import { populateFromNirmalaVidya } from '@/hooks/lectureHooks'

export const Lectures: CollectionConfig = {
  slug: 'lectures',
  labels: {
    singular: 'Lecture',
    plural: 'Lectures',
  },
  endpoints: [lecturesForAudience],
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'thumbnail'],
  },
  hooks: {
    beforeChange: [populateFromNirmalaVidya],
    beforeDelete: [deleteChildren({ collection: 'lecture-clips', field: 'lecture' })],
  },
  fields: [
    urlField({
      name: 'nirmalVidyaVimeoUrl',
      required: true,
      // Promote the natural key from convention to schema. The seed importer
      // (and any future bulk write path) keys lectures on this URL; the unique
      // index makes accidental duplicates a hard error rather than a silent
      // data-shape bug.
      unique: true,
      index: true,
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
      required: false, // Hook satisfies this on create
      localized: true,
      admin: {
        // Hidden during create — the hook auto-populates this field
        condition: (data) => !!data?.id,
        description: 'Auto-populated from Nirmala Vidya. Can be edited after creation.',
      },
    },
    mediaField({
      name: 'thumbnail',
      required: false,
      admin: {
        description:
          'Optional override for the Nirmala Vidya thumbnail. If blank, the API thumbnail is used.',
        condition: (data) => !!data?.id,
      },
    }),
    {
      name: 'metadata',
      type: 'json',
      admin: {
        readOnly: true,
        condition: (data) => !!data?.id,
        description:
          'Auto-populated from Nirmala Vidya API on create and by the monthly sync job. Contains title, HLS URL, thumbnail URL, and per-locale subtitle URLs.',
      },
    },
    {
      name: 'audiences',
      type: 'relationship',
      relationTo: 'audiences',
      hasMany: true,
      filterOptions: () => true,
      admin: {
        description:
          'Audiences that control visibility. The lecture is shown to a viewer if ANY of the selected audiences passes. If empty, it is hidden from /api/lectures/for-audience and only surfaced when directly referenced (e.g. from a meditation or path step).',
      },
    },
    {
      name: 'clips',
      type: 'join',
      collection: 'lecture-clips',
      on: 'lecture',
      admin: {
        allowCreate: true,
        defaultColumns: ['title', 'startTime', 'endTime', 'audiences'],
        condition: (data) => !!data?.id,
      },
    },
  ],
}
