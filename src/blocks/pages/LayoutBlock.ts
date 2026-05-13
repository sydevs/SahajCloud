import type { FieldHook } from 'payload'

import { Block } from 'payload'
import slugify from 'slugify'

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
          label: 'Tabs',
          value: 'tabs',
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
      name: 'useColumnsOnDesktop',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        condition: (data) => data?.style === 'tabs',
        description: 'Display tabs as side-by-side columns on desktop screens.',
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
      hooks: {
        afterRead: [
          (({ value, siblingData }) => {
            if ((siblingData as { style?: string })?.style !== 'tabs') return value
            return (value as Array<{ title?: string; titleUrl?: string }>).map((item) => ({
              ...item,
              titleUrl: item.title
                ? `#${slugify(item.title, { strict: true, lower: true })}`
                : item.titleUrl,
            }))
          }) satisfies FieldHook,
        ],
      },
      fields: [
        mediaField({
          name: 'image',
          orientation: 'landscape',
          admin: {
            condition: (_, _siblingData, { blockData }) =>
              !['textList', 'tabs'].includes((blockData as { style?: string })?.style ?? ''),
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
                condition: (_, siblingData, { blockData }) =>
                  (blockData as { style?: string })?.style !== 'textList' &&
                  Boolean((siblingData as { title?: string })?.title),
                description:
                  'For Tabs style this is auto-computed as #slug-of-title and cannot be changed manually.',
              },
            },
          ],
        },
        {
          name: 'text',
          type: 'textarea',
        },
        {
          name: 'isDefault',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            condition: (_, _siblingData, { blockData }) =>
              (blockData as { style?: string })?.style === 'tabs',
            description: 'Mark this tab as selected by default.',
          },
        },
      ],
    },
  ],
}
