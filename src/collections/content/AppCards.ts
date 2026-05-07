import type { CollectionConfig, Field } from 'payload'

import { appCardsForAudience } from '@/endpoints'
import { mediaField, scheduleField, urlField } from '@/fields'
import { denyApiClientReads } from '@/lib/access'

const APP_PAGE_OPTIONS = [
  { label: 'Map', value: 'map' },
  { label: 'Lectures', value: 'lectures' },
  { label: 'Path', value: 'path' },
  { label: 'Music', value: 'music' },
  { label: 'Live Meditations', value: 'live-meditations' },
]

const TIME_REGEX = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/

/** Destination row shared across all view tabs. */
function destinationFields(): Field[] {
  return [
    {
      type: 'row',
      fields: [
        {
          name: 'destination',
          type: 'select',
          options: [
            { label: 'App Page', value: 'appPage' },
            { label: 'Lecture', value: 'lecture' },
            { label: 'Album', value: 'album' },
            { label: 'Meditation', value: 'meditation' },
            { label: 'URL', value: 'url' },
          ],
          admin: {
            description: 'Where this card navigates to when tapped.',
          },
        },
        {
          name: 'appPage',
          type: 'select',
          options: APP_PAGE_OPTIONS,
          admin: {
            condition: (_, siblingData) => siblingData?.destination === 'appPage',
            description: 'App page this card links to.',
          },
        },
        {
          name: 'lecture',
          type: 'relationship',
          relationTo: 'lectures',
          admin: {
            condition: (_, siblingData) => siblingData?.destination === 'lecture',
          },
        },
        {
          name: 'album',
          type: 'relationship',
          relationTo: 'albums',
          admin: {
            condition: (_, siblingData) => siblingData?.destination === 'album',
          },
        },
        {
          name: 'meditation',
          type: 'relationship',
          relationTo: 'meditations',
          admin: {
            condition: (_, siblingData) => siblingData?.destination === 'meditation',
          },
        },
        urlField({
          name: 'url',
          label: 'URL',
          localized: true,
          admin: {
            condition: (_, siblingData) => siblingData?.destination === 'url',
          },
        }),
      ],
    },
  ]
}

/** Fields shared by all view tabs (no enabled/threshold). */
function defaultViewFields(): Field[] {
  return [
    {
      name: 'header',
      type: 'text',
      localized: true,
      admin: {
        description: 'Shown above the card in hero placement.',
      },
    },
    mediaField({ name: 'image', label: 'Card Image' }),
    {
      name: 'overlay',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Render card with dark overlay and white text.',
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'subtitle',
      type: 'text',
      localized: true,
    },
    {
      name: 'button',
      type: 'text',
      localized: true,
      admin: {
        description: 'Button label text.',
      },
    },
    ...destinationFields(),
  ]
}

/** Fields for Starting Soon / Live Now view tabs (adds enabled + threshold gate). */
function eventViewFields(thresholdDefault: string): Field[] {
  return [
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'threshold',
      type: 'text',
      defaultValue: thresholdDefault,
      admin: {
        condition: (_, siblingData) => siblingData?.enabled === true,
        description: 'How long before the event start this view activates (HH:MM).',
      },
      validate: (value: string | null | undefined) => {
        if (!value) return true
        if (!TIME_REGEX.test(value)) return 'Enter time in HH:MM format (e.g., 1:00 or 00:30)'
        return true
      },
    },
    {
      name: 'header',
      type: 'text',
      localized: true,
      admin: {
        condition: (_, siblingData) => siblingData?.enabled === true,
        description: 'Shown above the card in hero placement.',
      },
    },
    mediaField({
      name: 'image',
      label: 'Card Image',
      admin: { condition: (_, siblingData) => siblingData?.enabled === true },
    }),
    {
      name: 'overlay',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        condition: (_, siblingData) => siblingData?.enabled === true,
        description: 'Render card with dark overlay and white text.',
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      admin: {
        condition: (_, siblingData) => siblingData?.enabled === true,
      },
    },
    {
      name: 'subtitle',
      type: 'text',
      localized: true,
      admin: {
        condition: (_, siblingData) => siblingData?.enabled === true,
      },
    },
    {
      name: 'button',
      type: 'text',
      localized: true,
      admin: {
        condition: (_, siblingData) => siblingData?.enabled === true,
        description: 'Button label text.',
      },
    },
    ...destinationFields(),
  ]
}

export const AppCards: CollectionConfig = {
  slug: 'app-cards',
  labels: {
    singular: 'App Card',
    plural: 'App Cards',
  },
  access: { read: denyApiClientReads('app-cards') },
  versions: {
    drafts: true,
    maxPerDoc: 5,
  },
  disableDuplicate: true,
  endpoints: [appCardsForAudience],
  admin: {
    group: 'WeMeditate App',
    defaultColumns: ['type', '_status'],
  },
  fields: [
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'standard',
      options: [
        { label: 'Standard', value: 'standard' },
        { label: 'Event', value: 'event' },
      ],
      admin: {
        components: {
          Field: '@/components/admin/ToggleGroupField',
        },
      },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Appearance',
          fields: [
            {
              type: 'ui',
              name: 'viewWindowDisplay',
              admin: {
                components: {
                  Field: '@/components/admin/ViewWindowDisplay/ViewWindowDisplay',
                },
                condition: (data) => data.type === 'event',
              },
            },
            {
              type: 'tabs',
              tabs: [
                {
                  name: 'default',
                  label: 'Default',
                  fields: defaultViewFields(),
                },
                {
                  name: 'startingSoon',
                  label: 'Starting Soon',
                  admin: {
                    condition: (data) => data.type === 'event',
                  },
                  fields: eventViewFields('1:00'),
                },
                {
                  name: 'liveNow',
                  label: 'Live Now',
                  admin: {
                    condition: (data) => data.type === 'event',
                  },
                  fields: eventViewFields('0:00'),
                },
              ],
            },
          ],
        },
        {
          label: 'Rules',
          fields: [
            scheduleField({
              hasExclusions: true,
              hasComplexWeekly: true,
              hasEndTime: true,
              admin: {
                condition: (data) => data.type === 'event',
                description: 'Configure the recurring event schedule for this card.',
              },
            }),
            {
              name: 'targetSections',
              type: 'select',
              hasMany: true,
              options: [
                { label: 'Hero Card', value: 'hero' },
                { label: 'Highlights Section', value: 'highlights' },
                { label: 'Lectures Page', value: 'lectures' },
              ],
              admin: {
                description: 'Target sections where this card should appear on the app homepage.',
              },
            },
            {
              name: 'audiences',
              type: 'relationship',
              relationTo: 'audiences',
              hasMany: true,
              filterOptions: () => ({ type: { equals: 'progress' } }),
              admin: {
                description:
                  'Audiences that control visibility. The card is shown to a viewer if ANY of the selected audiences passes. If empty, the card is hidden from /api/app-cards/for-audience and never appears on the app homepage.',
              },
            },
            {
              name: 'conditions',
              type: 'relationship',
              relationTo: 'audiences',
              hasMany: true,
              filterOptions: () => ({ type: { equals: 'context' } }),
              admin: {
                description:
                  'Display conditions that ALL must be satisfied (AND). Use for country gates. Leave empty to bypass condition gating.',
              },
            },
            {
              name: 'weight',
              type: 'number',
              label: 'Display Frequency',
              min: 1,
              max: 5,
              defaultValue: 3,
              admin: {
                width: '60%',
                description:
                  'Controls how likely this card is to be chosen when displayed to a user.',
                components: {
                  Field: '@/components/admin/RangeSlider',
                },
                custom: {
                  labels: {
                    1: 'Less frequent',
                    3: 'Regular frequency',
                    5: 'More frequent',
                  },
                },
              },
            },
          ],
        },
      ],
    },
  ],
}
