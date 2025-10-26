import { Block } from 'payload'
import { MediaField } from '@/fields'

export const TextBoxBlock: Block = {
  slug: 'textbox',
  labels: {
    singular: 'Text Box',
    plural: 'Text Boxes',
  },
  fields: [
    MediaField({
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
      admin: {
        readOnly: true,
        description: 'Original import data (background, color, position, spacing, decorations)',
      },
    },
  ],
}
