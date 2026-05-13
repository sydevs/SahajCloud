import { Block } from 'payload'

import { mediaField } from '@/fields'

export const LayoutBlock: Block = {
  slug: 'layout',
  // Icon: 2x2 grid (20x20, gray stroked)
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjYiIGhlaWdodD0iNiIgcng9IjEiLz48cmVjdCB4PSIxMSIgeT0iMyIgd2lkdGg9IjYiIGhlaWdodD0iNiIgcng9IjEiLz48cmVjdCB4PSIzIiB5PSIxMSIgd2lkdGg9IjYiIGhlaWdodD0iNiIgcng9IjEiLz48cmVjdCB4PSIxMSIgeT0iMTEiIHdpZHRoPSI2IiBoZWlnaHQ9IjYiIHJ4PSIxIi8+PC9zdmc+Cg==',
  admin: {
    group: 'Layout',
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
        {
          label: 'List',
          value: 'list',
        },
        {
          label: 'Text List',
          value: 'textList',
        },
      ],
      admin: {
        components: {
          Field: '@/components/admin/ToggleGroupField',
        },
      },
    },
    {
      name: 'title',
      type: 'text',
      admin: {
        description:
          'If you use this title instead of a regular heading block, this title will be used as a sticky header that remains visible as you scroll through the blocks.',
      },
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
        mediaField({
          name: 'image',
          orientation: 'landscape',
          admin: {
            condition: (data) => (data as { style?: string })?.style !== 'textList',
          },
        }),
        {
          type: 'row',
          fields: [
            {
              name: 'title',
              type: 'text',
            },
            {
              name: 'titleUrl',
              type: 'text',
              label: 'Title Link',
              admin: {
                condition: (data, siblingData) =>
                  (data as { style?: string })?.style !== 'textList' &&
                  Boolean(siblingData?.title),
              },
            },
          ],
        },
        {
          name: 'text',
          type: 'textarea',
        },
      ],
    },
  ],
}
