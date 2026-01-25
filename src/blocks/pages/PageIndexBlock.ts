import { Block } from 'payload'

export const PageIndexBlock: Block = {
  slug: 'page-index',
  labels: {
    singular: 'Page Index',
    plural: 'Page Indexes',
  },
  fields: [
    {
      name: 'filters',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Wisdom', value: 'wisdom' },
        { label: 'Lifestyle', value: 'lifestyle' },
        { label: 'Creativity', value: 'creativity' },
        { label: 'Event', value: 'event' },
        { label: 'Technique', value: 'technique' },
      ],
      admin: {
        description: 'Select page tags to use as filters for this index grid',
      },
    },
  ],
}
