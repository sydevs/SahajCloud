import { Block } from 'payload'

export const SplashBlock: Block = {
  slug: 'splash',
  interfaceName: 'SplashBlock',
  // Icon: Full-width banner (20x20, gray stroked)
  imageURL:
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCIgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiM2QjcyODAiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMiIgeT0iNCIgd2lkdGg9IjE2IiBoZWlnaHQ9IjEyIiByeD0iMSIvPjxjaXJjbGUgY3g9IjYiIGN5PSI4IiByPSIxLjUiLz48bGluZSB4MT0iNiIgeTE9IjEyIiB4Mj0iMTQiIHkyPSIxMiIvPjxsaW5lIHgxPSI4IiB5MT0iMTQiIHgyPSIxMiIgeTI9IjE0Ii8+PC9zdmc+Cg==',
  labels: {
    singular: 'Splash Screen',
    plural: 'Splash Screens',
  },
  admin: {
    group: 'Layout',
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
