import { Block } from 'payload'

export const ButtonBlock: Block = {
  slug: 'button',
  fields: [
    {
      name: 'text',
      type: 'text',
      localized: true,
    },
    {
      name: 'url',
      type: 'text',
    },
  ],
}
