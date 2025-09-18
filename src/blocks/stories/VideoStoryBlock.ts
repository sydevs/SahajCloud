import type { Block, Condition } from 'payload'

export const VideoStoryBlock: Block = {
  slug: 'video',
  labels: {
    singular: 'Video Panel',
    plural: 'Video Panels',
  },
  fields: [
    {
      name: 'video',
      type: 'upload',
      relationTo: 'files',
      admin: {
        condition: ({ data, blockData }) => {
          console.log('Set Video Story', data, blockData)
          return data.owner === blockData.id
        },
      },
    },
  ],
}
