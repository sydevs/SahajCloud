import type { CollectionConfig } from 'payload'

import { mediaField } from '@/fields'

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
    defaultColumns: ['title', 'parent', 'startTime', 'endTime', 'tags'],
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
      required: true,
      localized: true,
    },
    mediaField({
      name: 'thumbnail',
      required: false,
      admin: {
        description:
          'Optional. The for-viewer endpoint merges the parent lecture thumbnail when empty.',
      },
    }),
    {
      name: 'subtitlesUrl',
      type: 'text',
      localized: true,
      admin: {
        description:
          'Optional per-locale VTT override. The for-viewer endpoint merges the parent lecture subtitle URL when empty.',
      },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'lecture-tags',
      hasMany: true,
      admin: {
        description:
          'Tags control visibility in listings and indexes. A clip with no tags will never appear in any listing — it will only be shown when directly referenced from a meditation or path step.',
      },
    },
  ],
}
