import type { CollectionConfig, Field } from 'payload'

import { z } from 'zod'

import { mediaField, scheduleFields, urlField } from '@/fields'
import { jsonField } from '@/fields/jsonField'

import { appCardsForAudience } from './endpoints/forAudience'
import { TIME_REGEX, viewScheduleAfterRead } from './hooks/viewSchedule'

/** Destination row shared across all view tabs. */
function destinationFields(
  condition?: (data: Record<string, unknown>, siblingData: Record<string, unknown>) => boolean,
): Field[] {
  return [
    {
      type: 'row',
      ...(condition ? { admin: { condition } } : {}),
      fields: [
        {
          name: 'destination',
          type: 'select',
          // Per locale because `url` and `meditation` are (#1001, #981).
          // `page`, `lecture` and `album` stay shared — each points at a
          // document localized itself.
          localized: true,
          options: [
            { label: 'Page', value: 'page' },
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
          name: 'page',
          type: 'relationship',
          relationTo: 'pages',
          admin: {
            condition: (_, siblingData) => siblingData?.destination === 'page',
            description: 'Page this card links to.',
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
          // A meditation document IS single-locale (src/collections/AGENTS.md), so
          // the card's target differs per language and the picker only ever lists
          // the admin's own locale.
          localized: true,
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
  const heroCondition = (data: Record<string, unknown>) => {
    const sections = data?.targetSections as string[] | null | undefined
    return !!sections?.includes('hero')
  }

  return [
    {
      name: 'header',
      type: 'text',
      localized: true,
      admin: {
        condition: heroCondition,
        description: 'Shown above the card in hero placement.',
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      admin: {
        components: {
          afterInput: ['@/components/admin/VariableInsert'],
        },
        custom: {
          variables: ['event_time'],
        },
      },
    },
    {
      name: 'subtitle',
      type: 'text',
      localized: true,
      admin: {
        components: {
          afterInput: ['@/components/admin/VariableInsert'],
        },
        custom: {
          variables: ['event_time'],
        },
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'buttonText',
          type: 'text',
          localized: true,
          admin: {
            description: 'Button label text.',
          },
        },
        mediaField({
          name: 'buttonIcon',
          label: 'Button Icon',
          admin: { condition: (_, siblingData) => !!siblingData?.buttonText },
        }),
      ],
    },
    ...destinationFields(),
    mediaField({ name: 'image', label: 'Card Image' }),
    {
      type: 'collapsible',
      label: 'Text & Layout',
      fields: [
        {
          name: 'aspectRatio',
          type: 'select',
          options: [
            { label: 'Square', value: 'square' },
            { label: 'Flexible', value: 'flexible' },
          ],
          defaultValue: 'square',
          required: true,
          admin: {
            description: 'Card image aspect ratio.',
            components: { Field: '@/components/admin/ToggleGroupField' },
          },
        },
        {
          name: 'textColor',
          type: 'select',
          options: [
            { label: 'Black', value: 'black' },
            { label: 'White', value: 'white' },
          ],
          defaultValue: 'black',
          required: true,
          admin: {
            description: 'Text color used over the card image.',
            components: { Field: '@/components/admin/ToggleGroupField' },
          },
        },
        {
          name: 'alignment',
          type: 'select',
          defaultValue: 'center',
          required: true,
          options: [
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
          ],
          admin: {
            description: 'Text alignment for card content.',
            components: {
              Field: '@/components/admin/ToggleGroupField',
            },
          },
        },
      ],
    },
  ]
}

/** Fields for Starting Soon / Live Now view tabs (adds enabled + threshold gate). */
function eventViewFields(thresholdDefault: string): Field[] {
  const enabledCondition = (_: Record<string, unknown>, siblingData: Record<string, unknown>) =>
    siblingData?.enabled === true

  const headerCondition = (data: Record<string, unknown>, siblingData: Record<string, unknown>) => {
    if (siblingData?.enabled !== true) return false
    const sections = data?.targetSections as string[] | null | undefined
    return !!sections?.includes('hero')
  }

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
        condition: enabledCondition,
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
        condition: headerCondition,
        description: 'Shown above the card in hero placement.',
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      admin: {
        condition: enabledCondition,
        components: {
          afterInput: ['@/components/admin/VariableInsert'],
        },
        custom: {
          variables: ['event_time'],
        },
      },
    },
    {
      name: 'subtitle',
      type: 'text',
      localized: true,
      admin: {
        condition: enabledCondition,
        components: {
          afterInput: ['@/components/admin/VariableInsert'],
        },
        custom: {
          variables: ['event_time'],
        },
      },
    },
    {
      type: 'row',
      admin: { condition: enabledCondition },
      fields: [
        {
          name: 'buttonText',
          type: 'text',
          localized: true,
          admin: {
            description: 'Button label text.',
          },
        },
        mediaField({
          name: 'buttonIcon',
          label: 'Button Icon',
          admin: { condition: (_, siblingData) => !!siblingData?.buttonText },
        }),
      ],
    },
    ...destinationFields(enabledCondition),
    mediaField({
      name: 'image',
      label: 'Card Image',
      admin: { condition: enabledCondition },
    }),
    {
      type: 'collapsible',
      label: 'Text & Layout',
      admin: { condition: enabledCondition },
      fields: [
        {
          name: 'aspectRatio',
          type: 'select',
          options: [
            { label: 'Square', value: 'square' },
            { label: 'Flexible', value: 'flexible' },
          ],
          defaultValue: 'square',
          required: true,
          admin: {
            description: 'Card image aspect ratio.',
            components: { Field: '@/components/admin/ToggleGroupField' },
          },
        },
        {
          name: 'textColor',
          type: 'select',
          options: [
            { label: 'Black', value: 'black' },
            { label: 'White', value: 'white' },
          ],
          defaultValue: 'black',
          required: true,
          admin: {
            description: 'Text color used over the card image.',
            components: { Field: '@/components/admin/ToggleGroupField' },
          },
        },
        {
          name: 'alignment',
          type: 'select',
          defaultValue: 'center',
          required: true,
          options: [
            { label: 'Left', value: 'left' },
            { label: 'Center', value: 'center' },
          ],
          admin: {
            description: 'Text alignment for card content.',
            components: {
              Field: '@/components/admin/ToggleGroupField',
            },
          },
        },
      ],
    },
  ]
}

export const AppCards: CollectionConfig = {
  slug: 'app-cards',
  labels: {
    singular: 'App Card',
    plural: 'App Cards',
  },
  versions: {
    // Object form, not `drafts: true` — that sanitises `localizeStatus` back to
    // false. Per-locale publish state, same contract as `pages` (#718).
    drafts: {
      localizeStatus: true,
    },
    maxPerDoc: 5,
  },
  disableDuplicate: true,
  endpoints: [appCardsForAudience],
  admin: {
    group: 'WeMeditate App',
    useAsTitle: 'label',
    defaultColumns: ['label', 'type', '_status'],
  },
  fields: [
    {
      name: 'label',
      type: 'text',
      label: 'Internal Name',
    },
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
            jsonField({
              // Virtual: written by `viewScheduleAfterRead` (`./hooks/viewSchedule`), never stored.
              // The schema exists for the generated type. See `src/collections/AGENTS.md`.
              name: 'viewSchedule',
              virtual: true,
              // Closed on both levels because the hook is the only writer and the
              // column is virtual — no stored row under an earlier shape to strand.
              schemaTitle: 'AppCardViewSchedule',
              schema: z.strictObject({
                timezone: z.string().describe('IANA zone the schedule keys are read in.'),
                schedule: z
                  .record(z.string(), z.enum(['startingSoon', 'liveNow', 'default']))
                  .describe('HH:MM (24-hour UTC) → the view active from then until the next key.'),
              }),
              hooks: {
                afterRead: [viewScheduleAfterRead],
              },
              admin: {
                condition: (data) => data.type === 'event',
                disableListColumn: true,
                disableListFilter: true,
                components: {
                  Field: '@/components/admin/AppCardViewSchedule',
                },
              },
            }),
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
          label: 'Event Schedule',
          admin: {
            condition: (data) => data.type === 'event',
          },
          fields: [
            scheduleFields({
              hasExclusions: true,
              hasComplexWeekly: true,
              hasEndTime: true,
              label: false,
            }),
          ],
        },
        {
          label: 'Rules',
          fields: [
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
              name: 'timings',
              type: 'select',
              hasMany: true,
              options: [
                { label: 'Morning', value: 'morning' },
                { label: 'Afternoon', value: 'afternoon' },
                { label: 'Evening', value: 'evening' },
                { label: 'Night', value: 'night' },
              ],
              admin: {
                description:
                  'Time-of-day slots when this card should be shown. Leave empty to show at all times.',
                components: {
                  Field: '@/components/admin/ToggleGroupField',
                },
              },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'audiences',
                  label: 'Viewer Audiences',
                  type: 'relationship',
                  relationTo: 'audiences',
                  hasMany: true,
                  admin: {
                    description:
                      'Card is shown to a viewer if they match ANY of these audiences (OR). Leave empty to hide the card from all viewers.',
                  },
                },
                {
                  name: 'conditions',
                  label: 'Required Conditions',
                  type: 'relationship',
                  relationTo: 'audiences',
                  hasMany: true,
                  admin: {
                    description:
                      'ALL of these must also pass (AND). Use for country gates. Leave empty to skip additional gating.',
                  },
                },
              ],
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
