import type { Block } from 'payload'

import { computeApiEndpoint } from '@/hooks/contentIndexBlockHooks'
import { PAGE_TAGS } from '@/lib/constants'

export const ContentIndexBlock: Block = {
  slug: 'content-index',
  // Icon: Grid of document pages (20x20, gray stroked)
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMiIgeT0iMiIgd2lkdGg9IjYiIGhlaWdodD0iNyIgcng9IjAuNSIvPjxsaW5lIHgxPSIzLjUiIHkxPSI0IiB4Mj0iNi41IiB5Mj0iNCIvPjxsaW5lIHgxPSIzLjUiIHkxPSI2IiB4Mj0iNS41IiB5Mj0iNiIvPjxyZWN0IHg9IjEyIiB5PSIyIiB3aWR0aD0iNiIgaGVpZ2h0PSI3IiByeD0iMC41Ii8+PGxpbmUgeDE9IjEzLjUiIHkxPSI0IiB4Mj0iMTYuNSIgeTI9IjQiLz48bGluZSB4MT0iMTMuNSIgeTE9IjYiIHgyPSIxNS41IiB5Mj0iNiIvPjxyZWN0IHg9IjIiIHk9IjExIiB3aWR0aD0iNiIgaGVpZ2h0PSI3IiByeD0iMC41Ii8+PGxpbmUgeDE9IjMuNSIgeTE9IjEzIiB4Mj0iNi41IiB5Mj0iMTMiLz48bGluZSB4MT0iMy41IiB5MT0iMTUiIHgyPSI1LjUiIHkyPSIxNSIvPjxyZWN0IHg9IjEyIiB5PSIxMSIgd2lkdGg9IjYiIGhlaWdodD0iNyIgcng9IjAuNSIvPjxsaW5lIHgxPSIxMy41IiB5MT0iMTMiIHgyPSIxNi41IiB5Mj0iMTMiLz48bGluZSB4MT0iMTMuNSIgeTE9IjE1IiB4Mj0iMTUuNSIgeTI9IjE1Ii8+PC9zdmc+Cg==',
  labels: {
    singular: 'Content Index',
    plural: 'Content Indexes',
  },
  admin: {
    group: 'Content',
  },
  fields: [
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'meditations',
      options: [
        { label: 'Meditations', value: 'meditations' },
        { label: 'Pages', value: 'pages' },
        { label: 'Songs', value: 'songs' },
        { label: 'Lectures', value: 'lectures' },
      ],
      admin: {
        components: {
          Field: '@/components/admin/ToggleGroupField',
        },
      },
    },
    {
      name: 'meditationFilters',
      type: 'relationship',
      relationTo: 'meditation-tags',
      hasMany: true,
      minRows: 1,
      admin: {
        condition: (_, siblingData) => siblingData?.type === 'meditations',
        description: 'Select meditation tags to use as filters for this index grid',
      },
    },
    {
      name: 'pageFilters',
      type: 'select',
      hasMany: true,
      required: true,
      options: PAGE_TAGS,
      admin: {
        condition: (_, siblingData) => siblingData?.type === 'pages',
        description: 'Select page tags to use as filters for this index grid',
      },
    },
    {
      name: 'songFilters',
      type: 'relationship',
      relationTo: 'song-tags',
      hasMany: true,
      minRows: 1,
      admin: {
        condition: (_, siblingData) => siblingData?.type === 'songs',
        description: 'Select music tags to use as filters for this index grid',
      },
    },
    {
      name: 'lectureFilters',
      type: 'relationship',
      relationTo: 'lecture-tags',
      hasMany: true,
      minRows: 1,
      admin: {
        condition: (_, siblingData) => siblingData?.type === 'lectures',
        description: 'Select lecture tags to use as filters for this index grid',
      },
    },
    {
      name: 'apiEndpoint',
      type: 'text',
      virtual: true,
      admin: { hidden: true },
      hooks: {
        afterRead: [computeApiEndpoint],
      },
    },
  ],
}
