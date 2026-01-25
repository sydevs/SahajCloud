import { Block } from 'payload'

export const MeditationsIndexBlock: Block = {
  slug: 'meditations-index',
  // Icon: Grid of circles (20x20, gray stroked)
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGNpcmNsZSBjeD0iNSIgY3k9IjUiIHI9IjIuNSIvPjxjaXJjbGUgY3g9IjEwIiBjeT0iNSIgcj0iMi41Ii8+PGNpcmNsZSBjeD0iMTUiIGN5PSI1IiByPSIyLjUiLz48Y2lyY2xlIGN4PSI1IiBjeT0iMTAiIHI9IjIuNSIvPjxjaXJjbGUgY3g9IjEwIiBjeT0iMTAiIHI9IjIuNSIvPjxjaXJjbGUgY3g9IjE1IiBjeT0iMTAiIHI9IjIuNSIvPjxjaXJjbGUgY3g9IjUiIGN5PSIxNSIgcj0iMi41Ii8+PGNpcmNsZSBjeD0iMTAiIGN5PSIxNSIgcj0iMi41Ii8+PGNpcmNsZSBjeD0iMTUiIGN5PSIxNSIgcj0iMi41Ii8+PC9zdmc+Cg==',
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
