import type { CollectionConfig, Field, FieldHook } from 'payload'

import { Temporal } from '@js-temporal/polyfill'

import { appCardsForAudience } from '@/endpoints'
import { mediaField, scheduleField, urlField } from '@/fields'
import type { ScheduleSubFields } from '@/hooks/scheduleHooks'
import { buildRRuleTemporal } from '@/hooks/scheduleHooks'

const APP_PAGE_OPTIONS = [
  { label: 'Map', value: 'map' },
  { label: 'Lectures', value: 'lectures' },
  { label: 'Path', value: 'path' },
  { label: 'Music', value: 'music' },
  { label: 'Live Meditations', value: 'live-meditations' },
]

const TIME_REGEX = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/

type ViewName = 'startingSoon' | 'liveNow' | 'default'

/**
 * afterRead hook: computes the view schedule spec for event-type app cards.
 *
 * Returns a timeline object: { timezone: "UTC", schedule: { "HH:MM": viewName } }.
 * Each key marks when that view becomes active (24-hour UTC); the selection lasts
 * until the next key. Keys are sorted ascending. Computed from the next upcoming
 * event occurrence. Returns null when no event views are enabled or no future
 * occurrence exists.
 */
const viewScheduleAfterRead: FieldHook = ({ data: doc, req }) => {
  if (doc?.type !== 'event') {
    return { timezone: 'UTC' as const, schedule: { '00:00': 'default' as ViewName } }
  }

  const schedule = doc.schedule as Partial<ScheduleSubFields> | null | undefined
  if (!schedule?.firstDate) return null

  const startingSoon = doc.startingSoon as Record<string, unknown> | null | undefined
  const liveNow = doc.liveNow as Record<string, unknown> | null | undefined

  const startingSoonEnabled = startingSoon?.enabled === true
  const liveNowEnabled = liveNow?.enabled === true
  if (!startingSoonEnabled && !liveNowEnabled) return null

  const rule = buildRRuleTemporal(schedule)
  if (!rule) return null

  const timezone = schedule.firstDate_tz || 'UTC'
  const endTimeStr = schedule.endTime

  // Compute the next upcoming event start time
  const now = new Date()
  type RRuleZDT = { epochMilliseconds: bigint }

  const isRecurring =
    !!schedule.recurrenceType && ['DAILY', 'WEEKLY', 'MONTHLY'].includes(schedule.recurrenceType)

  let nextISO: string | undefined

  if (isRecurring) {
    const until = new Date(now)
    until.setMonth(until.getMonth() + 6)
    const upcoming = (rule.between(now, until, true) as unknown as RRuleZDT[]).slice(0, 1)
    if (upcoming.length > 0) {
      nextISO = new Date(Number(upcoming[0]!.epochMilliseconds)).toISOString()
    }
  } else {
    const all = rule.all() as unknown as RRuleZDT[]
    const next = all.find((zdt) => Number(zdt.epochMilliseconds) > now.getTime())
    if (next) {
      nextISO = new Date(Number(next.epochMilliseconds)).toISOString()
    }
  }

  if (!nextISO) return null

  // Parse Starting Soon / Live Now thresholds to total minutes
  const ssThresholdStr = (startingSoon?.threshold as string | undefined) ?? '1:00'
  const ssMatch = ssThresholdStr.match(TIME_REGEX)
  const ssMinutes =
    startingSoonEnabled && ssMatch
      ? parseInt(ssMatch[1]!, 10) * 60 + parseInt(ssMatch[2]!, 10)
      : null

  const lnThresholdStr = (liveNow?.threshold as string | undefined) ?? '0:00'
  const lnMatch = lnThresholdStr.match(TIME_REGEX)
  const lnMinutes =
    liveNowEnabled && lnMatch ? parseInt(lnMatch[1]!, 10) * 60 + parseInt(lnMatch[2]!, 10) : 0

  // Converts a Temporal.Instant to HH:MM in UTC (24-hour clock)
  const toUTCHHMM = (instant: Temporal.Instant): string => {
    const d = new Date(Number(instant.epochMilliseconds))
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  }

  try {
    const eventStart = Temporal.Instant.from(nextISO).toZonedDateTimeISO(timezone)

    // Event end: use configured endTime or default to +1 hour
    let eventEnd: Temporal.ZonedDateTime
    if (endTimeStr) {
      const m = endTimeStr.match(TIME_REGEX)
      eventEnd = m
        ? eventStart.with({
            hour: parseInt(m[1]!, 10),
            minute: parseInt(m[2]!, 10),
            second: 0,
            millisecond: 0,
            microsecond: 0,
            nanosecond: 0,
          })
        : eventStart.add({ minutes: 60 })
    } else {
      eventEnd = eventStart.add({ minutes: 60 })
    }

    // Build timeline entries: [HH:MM, viewName] — later entries win on duplicate keys.
    // "00:00": "default" anchors the start of the 24-hour cycle so every hour is covered.
    // If an event view starts at midnight it sorts after this baseline and overwrites it.
    const entries: Array<[string, ViewName]> = [['00:00', 'default']]

    if (startingSoonEnabled && ssMinutes !== null) {
      entries.push([
        toUTCHHMM(eventStart.subtract({ minutes: ssMinutes }).toInstant()),
        'startingSoon',
      ])
    }

    // liveNow start: eventStart − lnThreshold (0 = exactly at event start)
    if (liveNowEnabled) {
      const lnStartInstant =
        lnMinutes > 0
          ? eventStart.subtract({ minutes: lnMinutes }).toInstant()
          : eventStart.toInstant()
      entries.push([toUTCHHMM(lnStartInstant), 'liveNow'])
    } else {
      // SS-only: default takes over at event start
      entries.push([toUTCHHMM(eventStart.toInstant()), 'default'])
    }

    // Event end: switch back to default (liveNow only)
    if (liveNowEnabled) {
      entries.push([toUTCHHMM(eventEnd.toInstant()), 'default'])
    }

    // Sort ascending; duplicate timestamps: last entry wins (event view overrides default baseline)
    entries.sort((a, b) => a[0].localeCompare(b[0]))

    const timelineSchedule: Record<string, ViewName> = {}
    for (const [hhmm, view] of entries) {
      timelineSchedule[hhmm] = view
    }

    return { timezone: 'UTC' as const, schedule: timelineSchedule }
  } catch (err) {
    req.payload.logger.debug({ msg: 'viewSchedule computation failed', error: err })
    return null
  }
}

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
            description:
              "Card image aspect ratio. 'Square' renders a fixed 1:1 image; 'Flexible' lets the image height follow its natural aspect ratio.",
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
            description:
              "Card image aspect ratio. 'Square' renders a fixed 1:1 image; 'Flexible' lets the image height follow its natural aspect ratio.",
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
    drafts: true,
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
            {
              name: 'viewSchedule',
              type: 'json',
              virtual: true,
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
          label: 'Event Schedule',
          admin: {
            condition: (data) => data.type === 'event',
          },
          fields: [
            scheduleField({
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
