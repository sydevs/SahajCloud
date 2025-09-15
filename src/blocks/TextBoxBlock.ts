import { Block } from 'payload'
import { validateCharacterCount } from '@/lib/validators/characterCount'

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
      ],
      admin: {
        description: 'Display style for the text box',
      },
    },
    {
      name: 'title',
      type: 'text',
      localized: true,
      admin: {
        description: 'Optional title for this text box',
      },
    },
    {
      name: 'text',
      type: 'richText',
      required: true,
      localized: true,
      validate: validateCharacterCount(250),
      admin: {
        description: 'Main content text (max 250 characters)',
      },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Optional image to accompany the content',
      },
    },
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
      localized: true,
      admin: {
        description: 'Call-to-action text for the link',
        condition: (_, siblingData) => Boolean(siblingData?.link),
      },
    },
  ],
}