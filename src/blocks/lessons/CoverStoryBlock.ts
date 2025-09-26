import { Block } from 'payload'

export const CoverStoryBlock: Block = {
  slug: 'cover',
  labels: {
    singular: 'Cover Panel',
    plural: 'Cover Panels',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'quote',
      type: 'textarea',
      required: true,
    },
  ],
}
