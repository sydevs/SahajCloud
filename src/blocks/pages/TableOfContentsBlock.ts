import type { Block } from 'payload'

export const TableOfContentsBlock: Block = {
  slug: 'table-of-contents',
  // Icon: Hierarchical list (20x20, gray stroked) — 4 lines at varying indentation
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGxpbmUgeDE9IjMiIHkxPSI0IiB4Mj0iMTMiIHkyPSI0Ii8+PGxpbmUgeDE9IjYiIHkxPSI4IiB4Mj0iMTYiIHkyPSI4Ii8+PGxpbmUgeDE9IjYiIHkxPSIxMiIgeDI9IjE1IiB5Mj0iMTIiLz48bGluZSB4MT0iOSIgeTE9IjE2IiB4Mj0iMTciIHkyPSIxNiIvPjwvc3ZnPg==',
  labels: {
    singular: 'Table of Contents',
    plural: 'Tables of Contents',
  },
  admin: {
    group: 'Content',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      admin: {
        description: 'Optional heading displayed above the list (e.g. "In this article")',
      },
    },
    {
      name: 'headings',
      type: 'json',
      admin: {
        description: 'Enabled headings to include in the table of contents',
        components: {
          Field: '@/components/admin/TableOfContentsField',
        },
      },
    },
  ],
}
