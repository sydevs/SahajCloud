import { Block } from 'payload'

export const ButtonBlock: Block = {
  slug: 'button',
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'text',
          type: 'text',
          required: true,
        },
        {
          name: 'url',
          type: 'text',
          required: true,
        },
      ],
    },
  ],
}
