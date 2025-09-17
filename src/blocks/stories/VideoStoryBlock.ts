import { Block } from 'payload'

export const VideoStoryBlock: Block = {
  slug: 'video',
  labels: {
    singular: 'Video Panel',
    plural: 'Video Panels',
  },
  fields: [
    {
      name: 'url',
      type: 'text',
      required: true,
    },
  ],
}
