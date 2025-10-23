import { Block } from 'payload'

export const ButtonBlock: Block = {
  slug: 'button',
  fields: [
    {
      name: 'text',
      type: 'text',
    },
    {
      name: 'url',
      type: 'text',
    },
  ],
}
