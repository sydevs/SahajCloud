import { Block } from 'payload'

export const SongsIndexBlock: Block = {
  slug: 'songs-index',
  // Icon: Grid with music notes (20x20, gray stroked)
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMiIgeT0iMiIgd2lkdGg9IjciIGhlaWdodD0iNyIgcng9IjAuNSIvPjxyZWN0IHg9IjExIiB5PSIyIiB3aWR0aD0iNyIgaGVpZ2h0PSI3IiByeD0iMC41Ii8+PHJlY3QgeD0iMiIgeT0iMTEiIHdpZHRoPSI3IiBoZWlnaHQ9IjciIHJ4PSIwLjUiLz48cmVjdCB4PSIxMSIgeT0iMTEiIHdpZHRoPSI3IiBoZWlnaHQ9IjciIHJ4PSIwLjUiLz48Y2lyY2xlIGN4PSI0LjUiIGN5PSI2IiByPSIxIiBmaWxsPSIjNkI3MjgwIi8+PGxpbmUgeDE9IjUuNSIgeTE9IjYiIHgyPSI1LjUiIHkyPSIzLjUiLz48Y2lyY2xlIGN4PSIxMy41IiBjeT0iNiIgcj0iMSIgZmlsbD0iIzZCNzI4MCIvPjxsaW5lIHgxPSIxNC41IiB5MT0iNiIgeDI9IjE0LjUiIHkyPSIzLjUiLz48Y2lyY2xlIGN4PSI0LjUiIGN5PSIxNSIgcj0iMSIgZmlsbD0iIzZCNzI4MCIvPjxsaW5lIHgxPSI1LjUiIHkxPSIxNSIgeDI9IjUuNSIgeTI9IjEyLjUiLz48Y2lyY2xlIGN4PSIxMy41IiBjeT0iMTUiIHI9IjEiIGZpbGw9IiM2QjcyODAiLz48bGluZSB4MT0iMTQuNSIgeTE9IjE1IiB4Mj0iMTQuNSIgeTI9IjEyLjUiLz48L3N2Zz4K',
  labels: {
    singular: 'Music Library',
    plural: 'Music Libraries',
  },
  admin: {
    group: 'Content',
  },
  fields: [
    {
      name: 'filters',
      type: 'relationship',
      relationTo: 'song-tags',
      hasMany: true,
      minRows: 1,
      admin: {
        description: 'Select music tags to use as filters for this index grid',
      },
    },
  ],
}
