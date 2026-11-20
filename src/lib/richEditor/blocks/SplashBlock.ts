import { Block } from 'payload'
import { relationship } from 'payload/shared'

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
      // Narrows the picker, so there is nothing broken to choose.
      filterOptions: () => ({
        and: [
          { eventType: { equals: 'online' } },
          // `notFinishedWhere` admits an inactive class by design — one has no schedule to
          // count down — so this arm is a second rule, not a duplicate of it.
          { inactive: { not_equals: true } },
          notFinishedWhere(new Date()),
        ],
      }),
      // ⚠ **A `validate` that composes `relationship` WITHOUT `filterOptions`, which
      // deliberately disarms the save-time refusal `src/collections/AGENTS.md` warns about
      // losing.** Here the refusal is what breaks, because the filter varies with the
      // clock and `validateFilterOptions` re-runs on every save with no exemption for a
      // value that did not change. Measured: the day a chosen class holds its last
      // session, every later save of the page — a typo, a translation, a republish —
      // answers 400 against a collapsed block, for an admin too, and deleting the block
      // is the only way out. Lexical also composes its own filter that answers `false`
      // for a collection `admin.hidden` hides from the caller, so with the refusal armed
      // a web-translator could not save such a page at all.
      //
      // Nothing is left unguarded: the consumer already degrades a class that is
      // unpublished, offline or dormant to that language's online classes, and reports it
      // (sydevs/WeMeditateWeb#309). This keeps the id's own shape check.
      // ⚠ `filterOptions: undefined` is the whole mechanism. Payload spreads the field's
      // own config into a validator's options, so composing `relationship` without
      // clearing it re-arms the very check this field declines.
      validate: async (value: unknown, options: unknown) =>
        relationship(
          value as never,
          {
            ...(options as object),
            filterOptions: undefined,
            relationTo: 'events',
          } as never,
        ),
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
