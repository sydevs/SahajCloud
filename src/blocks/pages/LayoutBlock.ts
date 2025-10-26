import { Block } from 'payload'
import { MediaField } from '@/fields'

export const LayoutBlock: Block = {
  slug: 'layout',
  fields: [
    {
      name: 'style',
      type: 'radio',
      required: true,
      options: [
        {
          label: 'Grid',
          value: 'grid',
        },
        {
          label: 'Columns',
          value: 'columns',
        },
        {
          label: 'Accordion',
          value: 'accordion',
        },
      ],
    },
    {
      name: 'items',
      type: 'array',
      labels: {
        singular: 'Item',
        plural: 'Items',
      },
      minRows: 1,
      maxRows: 10,
      validate: (value, { siblingData }) => {
        const style = (siblingData as { style?: string })?.style

        if (style === 'columns' && Array.isArray(value) && value.length > 3) {
          return 'When style is "Columns", you can add a maximum of 3 items'
        }

        return true
      },
      fields: [
        MediaField({
          name: 'image',
          orientation: 'landscape',
        }),
        {
          name: 'title',
          type: 'text',
        },
        {
          name: 'text',
          type: 'textarea',
        },
        {
          name: 'link',
          type: 'text',
        },
      ],
    },
  ],
}
