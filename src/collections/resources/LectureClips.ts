import type { CollectionConfig } from 'payload'

import { mediaField } from '@/fields'
import { LOCALES, getLocaleLabel } from '@/lib/locales'

const LOCALE_OPTIONS = LOCALES.map(({ code }) => ({ label: getLocaleLabel(code), value: code }))

// Default clip length when an editor first opens the row — editors can override,
// but a sensible pre-filled span beats empty inputs.
const DEFAULT_CLIP_LENGTH_SECONDS = 10 * 60

export const LectureClips: CollectionConfig = {
  slug: 'lecture-clips',
  labels: {
    singular: 'Lecture Clip',
    plural: 'Lecture Clips',
  },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    hidden: true,
    defaultColumns: ['title', 'parent', 'startTime', 'endTime', 'audiences'],
  },
  fields: [
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'lectures',
      required: true,
    },
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
          defaultValue: DEFAULT_CLIP_LENGTH_SECONDS,
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
      name: 'duration',
      type: 'number',
      virtual: true,
      admin: { hidden: true },
      hooks: {
        afterRead: [({ data }) => (data?.endTime ?? 0) - (data?.startTime ?? 0)],
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    mediaField({
      name: 'thumbnail',
      required: false,
      admin: {
        description:
          "Optional. Falls back to the parent lecture's thumbnail when empty — fallback is applied by /api/lectures/for-audience, not by this collection's CRUD endpoints.",
      },
    }),
    {
      name: 'subtitles',
      type: 'array',
      localized: false,
      admin: {
        description:
          "Per-locale subtitle overrides. Any locale not listed here falls back to the parent lecture's Nirmala Vidya subtitles.",
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
      name: 'audiences',
      type: 'relationship',
      relationTo: 'audiences',
      hasMany: true,
      filterOptions: () => true,
      admin: {
        description:
          'Audiences that control visibility. The clip is shown to a viewer if ANY of the selected audiences passes. If empty, it is hidden from /api/lectures/for-audience and only surfaced when directly referenced (e.g. from a meditation or path step).',
      },
    },
  ],
}
