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
  versions: {
    drafts: true,
    maxPerDoc: 5,
  },
  endpoints: [lecturesForViewer],
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'thumbnail', '_status'],
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
      type: 'row',
      fields: [
        {
          name: 'startTime',
          type: 'number',
          required: true,
          defaultValue: 0,
          min: 0,
          admin: {
            description: 'Start of the excerpt (HH:MM:SS)',
            components: {
              Field: '@/components/admin/TimestampInput',
            },
          },
        },
        {
          name: 'endTime',
          type: 'number',
          required: true,
          defaultValue: 10 * 60,
          min: 0,
          admin: {
            description: 'End of the excerpt (HH:MM:SS)',
            components: {
              Field: '@/components/admin/TimestampInput',
            },
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
    },
  ],
}
