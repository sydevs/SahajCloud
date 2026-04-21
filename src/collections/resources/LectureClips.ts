import type { CollectionConfig } from 'payload'

import { mediaField } from '@/fields'

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
    defaultColumns: ['title', 'parent', 'startTime', 'endTime', 'audience'],
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
          "Optional. Falls back to the parent lecture's thumbnail when empty — fallback is applied by /api/lectures/for-viewer, not by this collection's CRUD endpoints.",
      },
    }),
    {
      name: 'subtitlesUrl',
      type: 'text',
      localized: true,
      admin: {
        description:
          "Optional per-locale VTT override. Falls back to the parent lecture's subtitle URL when empty — fallback is applied by /api/lectures/for-viewer, not by this collection's CRUD endpoints.",
      },
    },
    {
      name: 'audience',
      type: 'relationship',
      relationTo: 'viewer-rules',
      hasMany: false,
      filterOptions: () => true,
      admin: {
        description:
          'Controls which viewers see this clip. If empty, it is hidden from /api/lectures/for-viewer and only surfaced when directly referenced (e.g. from a meditation or path step).',
      },
    },
  ],
}
