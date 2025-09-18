import type { Block } from 'payload'
import { FileField } from '@/fields'

export const VideoStoryBlock: Block = {
  slug: 'video',
  labels: {
    singular: 'Video Panel',
    plural: 'Video Panels',
  },
  fields: [
    FileField({
      name: 'video',
      admin: {
        condition: ({ data, blockData }) => {
          console.log('Set Video Story', data, blockData)
          return data.owner === blockData.id
        },
      },
    }),
  ],
}
