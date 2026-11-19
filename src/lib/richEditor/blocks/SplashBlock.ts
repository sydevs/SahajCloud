import { Block } from 'payload'

import { notFinishedWhere } from '@/collections/Events/lifecycle/finished'

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
      name: 'event',
      type: 'relationship',
      relationTo: 'events',
      admin: {
        condition: (_, siblingData) => siblingData?.layout === 'countdown',
        description: 'The online class this splash counts down to.',
      },
      // No `validate`: Payload installs `validateFilterOptions` only inside its own
      // `relationship` validator, and only for a field that supplies none
      // (`src/collections/AGENTS.md`). One here would narrow the picker and leave an API
      // `PATCH` naming any event at all unrefused.
      filterOptions: () => ({
        and: [
          { eventType: { equals: 'online' } },
          // `notFinishedWhere` admits an inactive class by design — one has no schedule to
          // count down — so this arm is a second rule, not a duplicate of it.
          { inactive: { not_equals: true } },
          notFinishedWhere(new Date()),
        ],
      }),
    },
    {
      name: 'textColor',
      type: 'select',
      label: 'Text Colour',
      defaultValue: 'dark',
      options: [
        { label: 'Dark Text', value: 'dark' },
        { label: 'Light Text', value: 'light' },
      ],
      admin: {
        description:
          'Text colour for the splash. Light text suits a dark hero; dark text suits a light hero. The overlaid site-header theme follows this setting.',
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
