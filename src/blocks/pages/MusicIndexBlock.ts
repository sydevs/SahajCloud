import { Block } from 'payload'

export const MusicIndexBlock: Block = {
  slug: 'music-index',
  labels: {
    singular: 'Music Index',
    plural: 'Music Indexes',
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
