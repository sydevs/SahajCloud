import { Block } from 'payload'

import { MediaField } from '@/fields'

export const TextStoryBlock: Block = {
  slug: 'text',
  labels: {
    singular: 'Text Panel',
    plural: 'Text Panels',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'text',
      type: 'textarea',
      required: true,
    },
    MediaField({
      name: 'image',
      required: true,
    }),
  ],
}
