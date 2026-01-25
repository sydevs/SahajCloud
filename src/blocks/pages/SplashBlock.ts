import { Block } from 'payload'

export const SplashBlock: Block = {
  slug: 'splash',
  labels: {
    singular: 'Splash',
    plural: 'Splashes',
  },
  fields: [
    {
      name: 'layout',
      type: 'select',
      required: true,
      defaultValue: 'default',
      options: [
        { label: 'Default', value: 'default' },
        { label: 'Countdown', value: 'countdown' },
        { label: 'App Promotion', value: 'app' },
        { label: 'Map Search', value: 'map-search' },
      ],
      admin: {
        description: 'Select the layout style for this splash section',
      },
    },
    {
      name: 'images',
      type: 'upload',
      relationTo: 'images',
      hasMany: true,
      minRows: 1,
      admin: {
        description: 'Select one or more images for the splash section',
      },
    },
    {
      name: 'title',
      type: 'text',
      admin: {
        condition: (_, siblingData) => siblingData?.layout !== 'map-search',
      },
    },
    {
      name: 'subtitle',
      type: 'text',
      admin: {
        condition: (_, siblingData) =>
          Boolean(siblingData?.title) && siblingData?.layout !== 'map-search',
      },
    },
    {
      name: 'actionText',
      type: 'text',
      admin: {
        description: 'Button or call-to-action text',
      },
    },
    {
      name: 'actionURL',
      type: 'text',
      admin: {
        condition: (_, siblingData) =>
          Boolean(siblingData?.actionText) && siblingData?.layout !== 'map-search',
        description: 'URL for the action button',
      },
    },
  ],
}
