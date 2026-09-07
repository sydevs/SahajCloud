import { Block } from 'payload'

import { mediaField } from '@/fields'

export const TextBoxBlock: Block = {
  slug: 'textbox',
  interfaceName: 'TextBoxBlock',
  // Icon: Rectangle with text lines and image placeholder (20x20, gray stroked)
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMiIgeT0iMyIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE0IiByeD0iMSIvPjxsaW5lIHgxPSI1IiB5MT0iNyIgeDI9IjEwIiB5Mj0iNyIvPjxsaW5lIHgxPSI1IiB5MT0iMTAiIHgyPSI5IiB5Mj0iMTAiLz48bGluZSB4MT0iNSIgeTE9IjEzIiB4Mj0iOCIgeTI9IjEzIi8+PHJlY3QgeD0iMTIiIHk9IjYiIHdpZHRoPSI0IiBoZWlnaHQ9IjUiIHJ4PSIwLjUiLz48L3N2Zz4K',
  labels: {
    singular: 'Text Box',
    plural: 'Text Boxes',
  },
  admin: {
    group: 'Layout',
  },
  fields: [
    mediaField({
      name: 'image',
      orientation: 'portrait',
      required: true,
    }),
    {
      name: 'imagePosition',
      type: 'radio',
      required: true,
      label: 'Image Position',
      defaultValue: 'left',
      options: [
        {
          label: 'Left Image',
          value: 'left',
        },
        {
          label: 'Right Image',
          value: 'right',
        },
        {
          label: 'Background',
          value: 'overlay',
        },
      ],
    },
    {
      name: 'textPosition',
      type: 'radio',
      required: true,
      label: 'Text Position',
      defaultValue: 'left',
      options: [
        {
          label: 'Left Textbox',
          value: 'left',
        },
        {
          label: 'Right Textbox',
          value: 'right',
        },
        {
          label: 'Centered',
          value: 'center',
        },
      ],
      admin: {
        condition: (_, siblingData) => siblingData?.imagePosition === 'overlay',
      },
    },
    {
      name: 'textColor',
      type: 'radio',
      required: true,
      label: 'Text Colour',
      defaultValue: 'dark',
      options: [
        {
          label: 'Dark Text',
          value: 'dark',
        },
        {
          label: 'Light Text',
          value: 'light',
        },
      ],
      admin: {
        condition: (_, siblingData) => siblingData?.imagePosition === 'overlay',
      },
    },
    {
      name: 'wisdomStyle',
      type: 'checkbox',
      label: 'Use "Ancient Wisdom" Styling',
      admin: {
        condition: (_, siblingData) =>
          Boolean(siblingData?.position) && siblingData?.position !== 'overlay',
      },
    },
    {
      name: 'title',
      type: 'text',
    },
    {
      name: 'subtitle',
      type: 'text',
      admin: {
        condition: (_, siblingData) => Boolean(siblingData?.title),
      },
    },
    {
      name: 'text',
      type: 'textarea',
    },
    {
      type: 'row',
      fields: [
        {
          name: 'buttonText',
          type: 'text',
        },
        {
          name: 'buttonUrl',
          type: 'text',
          required: true,
          admin: {
            condition: (_, siblingData) => Boolean(siblingData?.buttonText),
          },
        },
      ],
    },
    {
      name: 'importData',
      type: 'json',
      // No schema on purpose: this is the Storyblok block, verbatim, kept so an
      // import can be re-derived. Its shape is the source system's, not ours,
      // and it differs per block variant.
      admin: {
        readOnly: true,
        description: 'Original import data (background, color, position, spacing, decorations)',
      },
    },
  ],
}
