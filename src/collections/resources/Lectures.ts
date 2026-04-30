import type { CollectionConfig } from 'payload'

import { lecturesForAudience } from '@/endpoints'
import { mediaField, urlField } from '@/fields'
import { populateFromNirmalaVidya } from '@/hooks/lectureHooks'
import { LOCALES, getLocaleLabel } from '@/lib/locales'

const LOCALE_OPTIONS = LOCALES.map(({ code }) => ({ label: getLocaleLabel(code), value: code }))

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
  },
  fields: [
    urlField({
      name: 'nirmalVidyaVimeoUrl',
      required: true,
      // Indexed for query performance. Uniqueness is no longer enforced at
      // the schema level — excerpts share the parent's URL by design (each
      // record independently runs `populateFromNirmalaVidya` and stores its
      // own metadata copy).
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
      type: 'row',
      fields: [
        {
          name: 'startTime',
          type: 'number',
          min: 0,
          admin: {
            description: 'Optional start of the playback window (HH:MM:SS).',
            components: {
              Field: '@/components/admin/TimestampInput',
            },
            condition: (data) => !!data?.id,
          },
        },
        {
          name: 'endTime',
          type: 'number',
          min: 0,
          admin: {
            description: 'Optional end of the playback window (HH:MM:SS).',
            components: {
              Field: '@/components/admin/TimestampInput',
            },
            condition: (data) => !!data?.id,
          },
          validate: (
            value: number | null | undefined,
            { siblingData }: { siblingData: Record<string, unknown> },
          ) => {
            if (typeof value === 'number' && typeof siblingData?.startTime === 'number') {
              if (value <= siblingData.startTime) {
                return 'End time must be after start time'
              }
            }
            return true
          },
        },
      ],
    },
    {
      name: 'subtitles',
      type: 'array',
      localized: false,
      admin: {
        description:
          'Per-locale subtitle overrides. Any locale not listed here falls back to the Nirmala Vidya subtitles in metadata.',
        condition: (data) => !!data?.id,
      },
      fields: [
        {
          name: 'locale',
          type: 'select',
          required: true,
          options: LOCALE_OPTIONS,
        },
        {
          name: 'url',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'fullLecture',
      type: 'relationship',
      relationTo: 'lectures',
      filterOptions: ({ id }) => (id ? { id: { not_equals: id } } : true),
      admin: {
        description:
          'Optional pointer to a related lecture (e.g. the full talk that this excerpt is taken from). Informational only — chains and depth are not interpreted.',
        condition: (data) => !!data?.id,
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
      name: 'userChoices',
      type: 'relationship',
      relationTo: 'user-choices',
      hasMany: true,
      admin: {
        description:
          'User choices (mood/feeling tags) this lecture is relevant to. Used by the app to select contextually appropriate lectures.',
      },
    },
    {
      name: 'subtleSystemNodes',
      type: 'relationship',
      relationTo: 'subtle-system-nodes',
      hasMany: true,
      admin: {
        description:
          'Chakras and nadis discussed in this lecture. Drives the topical-overlap ranking in /api/meditations/:id/related-lectures — lectures with no nodes are excluded from that endpoint.',
      },
    },
    {
      name: 'clips',
      type: 'join',
      collection: 'lectures',
      on: 'fullLecture',
      admin: {
        allowCreate: true,
        defaultColumns: ['title', 'startTime', 'endTime', 'audiences'],
        condition: (data) => !!data?.id,
      },
    },
  ],
}
