import type { Block } from 'payload'

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
        description: 'Video file for this panel.',
      },
    },
  ],
}
