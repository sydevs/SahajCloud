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
          Description: '@/components/admin/SelectDescription',
        },
        custom: {
          descriptions: {
            grid: 'A responsive grid of items, each with an optional image, title, link, and text.',
            tabs: 'A tabbed interface where each item becomes a selectable tab.',
            accordion: 'A collapsible accordion where items can be expanded or collapsed.',
            list: 'A simple vertical list of items with optional images and links.',
            textList: 'A minimal list of text-only items without images or links.',
          },
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
      // Fill with the title of the default tab — slugified on save to match each item's titleUrl anchor
      name: 'defaultTab',
      type: 'text',
      admin: {
        condition: (_, siblingData) => (siblingData as { style?: string })?.style === 'tabs',
        description:
          'Enter the title of the tab that should be open by default. The value is automatically converted to match the tab anchor (e.g. "My Tab" → "#my-tab").',
      },
      hooks: {
        beforeChange: [
          ({ value }) => {
            if (!value || typeof value !== 'string') return value
            return `#${slugify(value, { strict: true, lower: true })}`
          },
        ],
      },
    },
    {
      name: 'useColumnsOnDesktop',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        condition: (_, siblingData) => (siblingData as { style?: string })?.style === 'tabs',
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
        beforeChange: [
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
                // Hidden for tabs — the anchor is auto-computed and returned via the afterRead hook
                condition: (_, siblingData, { blockData }) => {
                  const style = (blockData as { style?: string })?.style
                  if (style === 'textList' || style === 'tabs') return false
                  return Boolean((siblingData as { title?: string })?.title)
                },
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
