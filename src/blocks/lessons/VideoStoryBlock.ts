import type { Block } from 'payload'
import { FileAttachmentField } from '@/fields'

export const VideoStoryBlock: Block = {
  slug: 'video',
  labels: {
    singular: 'Video Panel',
    plural: 'Video Panels',
  },
  fields: [
    FileAttachmentField({
      name: 'video',
      ownerCollection: 'lessons',
      fileType: 'video',
    }),
  ],
}
