import { Block } from 'payload'

export const LayoutBlock: Block = {
  slug: 'layout',
  labels: {
    singular: 'Layout',
    plural: 'Layouts',
  },
  fields: [
    {
      name: 'style',
      type: 'select',
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
      admin: {
        description: 'Layout style for the items',
      },
    },
    {
      name: 'items',
      type: 'array',
      labels: {
        singular: 'Item',
        plural: 'Items',
      },
      fields: [
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          admin: {
            description: 'Optional image for this item',
          },
        },
        {
          name: 'title',
          type: 'text',
          localized: true,
          admin: {
            description: 'Optional title for this item',
          },
        },
        {
          name: 'text',
          type: 'richText',
          localized: true,
          admin: {
            description: 'Optional text content for this item',
          },
        },
        {
          name: 'link',
          type: 'text',
          admin: {
            description: 'Optional link URL for this item',
          },
        },
      ],
      admin: {
        description: 'Items to display in the layout',
      },
    },
  ],
}