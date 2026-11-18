import type { Block } from 'payload'

import { z } from 'zod'

import { jsonField } from '@/fields/jsonField'

export const TableOfContentsBlock: Block = {
  slug: 'table-of-contents',
  interfaceName: 'TableOfContentsBlock',
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
    jsonField({
      name: 'headings',
      // Written only by `TableOfContentsField`, which stores the subset of the
      // document's detected headings an author ticked. The schema restates that
      // component's `DetectedHeading` (`src/components/admin/TableOfContentsField/
      // headings.ts`), because a TypeScript type cannot build a schema.
      // Entries stay open so a heading gaining a field does not make every
      // existing page unsaveable.
      schemaTitle: 'TableOfContentsHeadings',
      schema: z.array(
        z.looseObject({
          slug: z.string(),
          text: z.string(),
          level: z.int(),
          // The heading's ordinal among the document's detected headings, which
          // is what tells two headings that slugify alike apart. Optional, or
          // the next save of every page stored before it would be refused —
          // so a consumer reads its absence as unknown, never as 0.
          index: z.int().optional(),
        }),
      ),
      admin: {
        description: 'Select headings above to include in the table of contents',
        components: {
          Field: '@/components/admin/TableOfContentsField',
        },
      },
    }),
  ],
}
