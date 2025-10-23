import { Block } from 'payload'
import { MediaField } from '@/fields'

export const TextBoxBlock: Block = {
  slug: 'textbox',
  labels: {
    singular: 'Text Box',
    plural: 'Text Boxes',
  },
  fields: [
    {
      name: 'style',
      type: 'select',
      required: true,
      defaultValue: 'splash',
      options: [
        {
          label: 'Splash',
          value: 'splash',
        },
        {
          label: 'Left Aligned',
          value: 'leftAligned',
        },
        {
          label: 'Right Aligned',
          value: 'rightAligned',
        },
        {
          label: 'Overlay',
          value: 'overlay',
        },
        {
          label: 'Overlay Dark',
          value: 'overlayDark',
        },
      ],
      admin: {
        description: 'Display style for the text box',
      },
    },
    {
      name: 'title',
      type: 'text',
      admin: {
        description: 'Optional title for this text box',
      },
    },
    {
      name: 'subtitle',
      type: 'text',
      admin: {
        description: 'Optional subtitle for this text box',
      },
    },
    {
      name: 'text',
      type: 'textarea',
      admin: {
        description: 'Main content text',
      },
    },
    MediaField({
      name: 'image',
      orientation: 'portrait',
      admin: {
        description: 'Optional image to accompany the content',
      },
    }),
    {
      name: 'link',
      type: 'text',
      admin: {
        description: 'Optional link URL',
      },
    },
    {
      name: 'actionText',
      type: 'text',
      admin: {
        description: 'Call-to-action text for the link',
        condition: (_, siblingData) => Boolean(siblingData?.link),
      },
    },
    {
      name: 'importData',
      type: 'json',
      admin: {
        readOnly: true,
        hidden: true,
        description: 'Original import data (background, color, position, spacing, decorations)',
      },
    },
  ],
}
