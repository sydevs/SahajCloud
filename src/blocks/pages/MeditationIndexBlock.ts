import { Block } from 'payload'

export const MeditationIndexBlock: Block = {
  slug: 'meditation-index',
  labels: {
    singular: 'Meditation Index',
    plural: 'Meditation Indexes',
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
