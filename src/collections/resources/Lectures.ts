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
        update: () => false, // Vimeo URL is immutable after creation
      },
    }),
    {
      name: 'title',
      type: 'text',
      required: false, // Hook satisfies this on create
      localized: true,
      admin: {
        condition: (data) => !!data?.id, // Hidden during create — the hook auto-populates this field
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
          'Per-locale subtitle overrides. Any locale not listed here falls back to the Nirmala Vidya subtitles (see metadata).',
        condition: (data) => !!data?.id,
      },
      fields: [
        {
          type: 'row',
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
      ],
    },
    {
      name: 'metadata',
      type: 'json',
      admin: {
        readOnly: true,
        condition: (data) => !!data?.id,
        description: 'Auto-populated from Nirmala Vidya API and updated monthly.',
      },
    },
    {
      name: 'fullLecture',
      type: 'relationship',
      relationTo: 'lectures',
      filterOptions: ({ id }) => (id ? { id: { not_equals: id } } : true),
      admin: {
        description:
          'If this lecture is an excerpt, filling this field will allow the user to see a link to the full lecture.',
        condition: (data) => !!data?.id,
        position: 'sidebar',
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
          'A user can view this lecture if they are a member of any of these audience groups. If empty, this lecture is only visible when directly referenced (e.g. from a meditation or path step).',
        position: 'sidebar',
      },
    },
    {
      name: 'userChoices',
      type: 'relationship',
      relationTo: 'user-choices',
      hasMany: true,
      admin: {
        description:
          'User choices this lecture is relevant to. Used by the app to select contextually appropriate lectures.',
        position: 'sidebar',
      },
    },
    {
      name: 'subtleSystemNodes',
      type: 'relationship',
      relationTo: 'subtle-system-nodes',
      hasMany: true,
      admin: {
        description:
          'Chakras and nadis discussed in this lecture. This allows us to select relevant lectures when a viewer finishes a meditation.',
        position: 'sidebar',
      },
    },
    {
      name: 'clips',
      type: 'join',
      collection: 'lectures',
      on: 'fullLecture',
      admin: {
        allowCreate: true,
        defaultColumns: ['title', 'startTime', 'endTime', 'subtleSystemNodes'],
        condition: (data) => !!data?.id,
      },
    },
  ],
}
