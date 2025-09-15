import { Block } from 'payload'

export const ButtonBlock: Block = {
  slug: 'button',
  labels: {
    singular: 'Button',
    plural: 'Buttons',
  },
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
