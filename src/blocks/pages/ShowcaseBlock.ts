import { Block } from 'payload'

export const ShowcaseBlock: Block = {
  slug: 'showcase',
  // Icon: Star with content lines (20x20, gray filled/stroked)
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTEwIDJsMiA0aDRsLTMgMyAxIDQtNC0yLTQgMiAxLTQtMy0zaDR6IiBmaWxsPSIjNkI3MjgwIi8+PGxpbmUgeDE9IjQiIHkxPSIxNiIgeDI9IjE2IiB5Mj0iMTYiLz48bGluZSB4MT0iNiIgeTE9IjE4IiB4Mj0iMTQiIHkyPSIxOCIvPjwvc3ZnPgo=',
  labels: {
    singular: 'Showcase',
    plural: 'Showcases',
  },
  admin: {
    group: 'Content',
  },
  fields: [
    {
      name: 'items',
      type: 'relationship',
      hasMany: true,
      minRows: 3,
      maxRows: 6,
      relationTo: ['meditations', 'pages'],
    },
  ],
}
