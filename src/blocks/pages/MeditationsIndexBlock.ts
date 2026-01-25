import { Block } from 'payload'

export const MeditationsIndexBlock: Block = {
  slug: 'meditations-index',
  // Icon: 2x2 grid of circles with center dots (20x20, gray stroked/filled)
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGNpcmNsZSBjeD0iNS41IiBjeT0iNS41IiByPSIzIi8+PGNpcmNsZSBjeD0iNS41IiBjeT0iNS41IiByPSIxIiBmaWxsPSIjNkI3MjgwIi8+PGNpcmNsZSBjeD0iMTQuNSIgY3k9IjUuNSIgcj0iMyIvPjxjaXJjbGUgY3g9IjE0LjUiIGN5PSI1LjUiIHI9IjEiIGZpbGw9IiM2QjcyODAiLz48Y2lyY2xlIGN4PSI1LjUiIGN5PSIxNC41IiByPSIzIi8+PGNpcmNsZSBjeD0iNS41IiBjeT0iMTQuNSIgcj0iMSIgZmlsbD0iIzZCNzI4MCIvPjxjaXJjbGUgY3g9IjE0LjUiIGN5PSIxNC41IiByPSIzIi8+PGNpcmNsZSBjeD0iMTQuNSIgY3k9IjE0LjUiIHI9IjEiIGZpbGw9IiM2QjcyODAiLz48L3N2Zz4K',
  labels: {
    singular: 'Meditations Index',
    plural: 'Meditation Indexes',
  },
  admin: {
    group: 'Content',
  },
  fields: [
    {
      name: 'filters',
      type: 'relationship',
      relationTo: 'meditation-tags',
      hasMany: true,
      minRows: 1,
      admin: {
        description: 'Select meditation tags to use as filters for this index grid',
      },
    },
  ],
}
