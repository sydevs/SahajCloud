import { Block } from 'payload'

import { PAGE_TAGS } from '@/lib/constants'

export const PagesIndexBlock: Block = {
  slug: 'pages-index',
  // Icon: Grid of document pages (20x20, gray stroked)
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMiIgeT0iMiIgd2lkdGg9IjYiIGhlaWdodD0iNyIgcng9IjAuNSIvPjxsaW5lIHgxPSIzLjUiIHkxPSI0IiB4Mj0iNi41IiB5Mj0iNCIvPjxsaW5lIHgxPSIzLjUiIHkxPSI2IiB4Mj0iNS41IiB5Mj0iNiIvPjxyZWN0IHg9IjEyIiB5PSIyIiB3aWR0aD0iNiIgaGVpZ2h0PSI3IiByeD0iMC41Ii8+PGxpbmUgeDE9IjEzLjUiIHkxPSI0IiB4Mj0iMTYuNSIgeTI9IjQiLz48bGluZSB4MT0iMTMuNSIgeTE9IjYiIHgyPSIxNS41IiB5Mj0iNiIvPjxyZWN0IHg9IjIiIHk9IjExIiB3aWR0aD0iNiIgaGVpZ2h0PSI3IiByeD0iMC41Ii8+PGxpbmUgeDE9IjMuNSIgeTE9IjEzIiB4Mj0iNi41IiB5Mj0iMTMiLz48bGluZSB4MT0iMy41IiB5MT0iMTUiIHgyPSI1LjUiIHkyPSIxNSIvPjxyZWN0IHg9IjEyIiB5PSIxMSIgd2lkdGg9IjYiIGhlaWdodD0iNyIgcng9IjAuNSIvPjxsaW5lIHgxPSIxMy41IiB5MT0iMTMiIHgyPSIxNi41IiB5Mj0iMTMiLz48bGluZSB4MT0iMTMuNSIgeTE9IjE1IiB4Mj0iMTUuNSIgeTI9IjE1Ii8+PC9zdmc+Cg==',
  labels: {
    singular: 'Pages Index',
    plural: 'Page Indexes',
  },
  admin: {
    group: 'Content',
  },
  fields: [
    {
      name: 'filters',
      type: 'select',
      hasMany: true,
      options: PAGE_TAGS,
      admin: {
        description: 'Select page tags to use as filters for this index grid',
      },
    },
  ],
}
