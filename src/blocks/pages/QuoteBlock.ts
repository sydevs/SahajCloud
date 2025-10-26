import { Block } from 'payload'

export const QuoteBlock: Block = {
  slug: 'quote',
  fields: [
    {
      name: 'title',
      type: 'text',
    },
    {
      name: 'text',
      type: 'textarea',
      required: true,
    },
    {
      name: 'credit',
      type: 'text',
      admin: {
        description: 'This is the author or other source for the quote.',
      },
    },
    {
      name: 'caption',
      type: 'text',
      admin: {
        condition: (_, siblingData) => Boolean(siblingData?.credit),
        description: 'This will appear below the credit.',
      },
    },
  ],
}
