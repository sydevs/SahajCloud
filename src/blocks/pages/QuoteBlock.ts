import { Block } from 'payload'

export const QuoteBlock: Block = {
  slug: 'quote',
  fields: [
    {
      name: 'text',
      type: 'text',
      required: true,
    },
    {
      name: 'author',
      type: 'text',
    },
    {
      name: 'subtitle',
      type: 'text',
    },
  ],
}
