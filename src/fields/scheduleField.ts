import type { Field, GroupField, JSONField } from 'payload'

import { computeRRule, computeUpcomingDates } from '@/hooks/scheduleHooks'

/**
 * Field factory options
 */
export interface ScheduleFieldOptions {
  /** Field name (default: 'schedule') */
  name?: string
  /** Field label (default: 'Schedule') */
  label?: string
  /** Whether sub-fields are required (default: true) */
  required?: boolean
  /** Show end time field (default: false) */
  endTime?: boolean
  /** Show weekday picker for weekly recurrence (default: false) */
  complexWeekly?: boolean
  /** Show day/weekday picker for monthly recurrence (default: false) */
  complexMonthly?: boolean
  /** Show ending conditions — count or until date (default: false) */
  ending?: boolean
  /** Default timezone (falls back to browser timezone if not specified) */
  defaultTimezone?: string
  /** Admin configuration (uses PayloadCMS JSONField admin type) */
  admin?: Partial<JSONField['admin']>
}

/**
 * Weekday options for the multi-select field
 */
const WEEKDAY_OPTIONS = [
  { label: 'Mon', value: '0' },
  { label: 'Tue', value: '1' },
  { label: 'Wed', value: '2' },
  { label: 'Thu', value: '3' },
  { label: 'Fri', value: '4' },
  { label: 'Sat', value: '5' },
  { label: 'Sun', value: '6' },
] as const

/**
 * Recurrence type options
 */
const RECURRENCE_OPTIONS = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
] as const

/**
 * Ending type options
 */
const ENDING_OPTIONS = [
  { label: 'After', value: 'count' },
  { label: 'On Date', value: 'until' },
] as const

/**
 * Creates a schedule field for event scheduling with datetime, timezone,
 * and iCalendar RRULE support.
 *
 * Returns a Group field with native PayloadCMS sub-fields that store
 * directly in individual database columns. Includes a virtual `rrule`
 * field that computes the iCalendar RRULE string on read.
 *
 * Core fields (always present): startDate, startTime, timezone,
 * recurrenceType, interval, rrule (virtual).
 *
 * Feature flags enable additional field groups:
 * - `endTime` — end time field
 * - `complexWeekly` — weekday picker for weekly recurrence
 * - `complexMonthly` — day/weekday picker for monthly recurrence
 * - `ending` — ending conditions (count or until date)
 *
 * @example Basic usage (core fields only)
 * ```typescript
 * fields: [
 *   scheduleField({ name: 'schedule' }),
 * ]
 * ```
 *
 * @example With feature flags
 * ```typescript
 * fields: [
 *   scheduleField({
 *     name: 'schedule',
 *     endTime: true,
 *     ending: true,
 *     defaultTimezone: 'America/New_York',
 *   }),
 * ]
 * ```
 */
export function scheduleField(options: ScheduleFieldOptions = {}): Field {
  const {
    name = 'schedule',
    label = 'Schedule',
    required = true,
    endTime: hasEndTime = false,
    complexWeekly: hasComplexWeekly = false,
    complexMonthly: hasComplexMonthly = false,
    ending: hasEnding = false,
    defaultTimezone,
    admin = {},
  } = options

  // Use the default timezone, and fall back to the browser time zone if needed
  const timezone = defaultTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone

  // Build sub-fields based on feature flags
  const subFields = buildScheduleSubFields({
    required,
    hasEndTime,
    hasComplexWeekly,
    hasComplexMonthly,
    hasEnding,
    defaultTimezone: timezone,
  })

  // Create the group field
  const groupField: GroupField = {
    name,
    type: 'group',
    label,
    admin: {
      description: admin.description || 'Configure when this event occurs and repeats',
      condition: admin.condition,
    },
    fields: subFields,
  }

  return groupField
}

/**
 * Build the sub-fields for the schedule group based on feature flags
 */
function buildScheduleSubFields(config: {
  required: boolean
  hasEndTime: boolean
  hasComplexWeekly: boolean
  hasComplexMonthly: boolean
  hasEnding: boolean
  defaultTimezone: string
}): Field[] {
  const { required, hasEndTime, hasComplexWeekly, hasComplexMonthly, hasEnding, defaultTimezone } =
    config

  const fields: Field[] = [
    // === Row 1: Date/Time ===
    {
      type: 'row',
      fields: [
        {
          name: 'startDate',
          type: 'date',
          label: 'Start Date',
          required,
          admin: {
            date: {
              pickerAppearance: 'dayOnly',
              displayFormat: 'MMM d, yyyy',
            },
          },
        },
        {
          name: 'startTime',
          type: 'text',
          label: 'Start Time',
          required,
          admin: {
            placeholder: 'HH:MM',
            description: '24-hour format',
          },
          validate: (value: string | null | undefined) => {
            if (!value) return true // Required validation handles empty
            const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/
            if (!timeRegex.test(value)) {
              return 'Enter time in HH:MM format (e.g., 09:00 or 14:30)'
            }
            return true
          },
        },
        ...(hasEndTime
          ? [
              {
                name: 'endTime',
                type: 'text',
                label: 'End Time',
                admin: {
                  placeholder: 'HH:MM',
                  description: 'Optional, same day (24-hour format)',
                },
                validate: (
                  value: string | null | undefined,
                  { siblingData }: { siblingData: Record<string, unknown> },
                ) => {
                  if (!value) return true // Optional field
                  const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/
                  if (!timeRegex.test(value)) {
                    return 'Enter time in HH:MM format (e.g., 17:00)'
                  }
                  // End time must be after start time
                  const startTime = siblingData?.startTime as string | undefined
                  if (startTime && timeRegex.test(startTime)) {
                    const [startH, startM] = startTime.split(':').map(Number)
                    const [endH, endM] = value.split(':').map(Number)
                    if (endH * 60 + endM <= startH * 60 + startM) {
                      return 'End time must be after start time'
                    }
                  }
                  return true
                },
              } satisfies Field,
            ]
          : []),
        {
          name: 'timezone',
          type: 'select',
          label: 'Timezone',
          required,
          defaultValue: defaultTimezone,
          options: Intl.supportedValuesOf('timeZone').map((tz) => ({
            label: tz.replace(/\//g, ' / ').replace(/_/g, ' '),
            value: tz,
          })),
          admin: {
            isClearable: false,
          },
        },
      ],
    },

    // === Row 2: Recurrence ===
    {
      type: 'row',
      fields: [
        {
          name: 'recurrenceType',
          type: 'select',
          label: 'Repeats',
          options: [...RECURRENCE_OPTIONS],
          admin: {
            placeholder: 'Does not repeat',
          },
        },
        {
          name: 'interval',
          type: 'number',
          label: 'Every',
          defaultValue: 1,
          min: 1,
          max: 99,
          required,
          admin: {
            step: 1,
            condition: (_data: Record<string, unknown>, siblingData: Record<string, unknown>) =>
              !!siblingData?.recurrenceType,
            description: 'Repeat every N days/weeks/months',
          },
        },
        ...(hasComplexWeekly
          ? [
              {
                name: 'weekdays',
                type: 'select',
                hasMany: true,
                label: 'On Days',
                options: [...WEEKDAY_OPTIONS],
                required,
                admin: {
                  condition: (
                    _data: Record<string, unknown>,
                    siblingData: Record<string, unknown>,
                  ) => siblingData?.recurrenceType === 'weekly',
                },
              } satisfies Field,
            ]
          : []),
        ...(hasComplexMonthly
          ? [
              {
                name: 'monthlyMode',
                type: 'select',
                label: 'Monthly Mode',
                defaultValue: 'date',
                required,
                options: [
                  { label: 'By date', value: 'date' },
                  { label: 'By weekday', value: 'weekday' },
                ],
                admin: {
                  condition: (
                    _data: Record<string, unknown>,
                    siblingData: Record<string, unknown>,
                  ) => siblingData?.recurrenceType === 'monthly',
                  isClearable: false,
                },
              } satisfies Field,
              {
                name: 'monthDay',
                type: 'number',
                label: 'On Day',
                defaultValue: 1,
                min: 1,
                max: 31,
                required,
                admin: {
                  step: 1,
                  condition: (
                    _data: Record<string, unknown>,
                    siblingData: Record<string, unknown>,
                  ) =>
                    siblingData?.recurrenceType === 'monthly' &&
                    siblingData?.monthlyMode === 'date',
                  description: 'Day of the month (1-31)',
                },
              } satisfies Field,
              {
                name: 'weekNumber',
                type: 'select',
                label: 'Week',
                defaultValue: '1',
                options: [
                  { label: '1st', value: '1' },
                  { label: '2nd', value: '2' },
                  { label: '3rd', value: '3' },
                  { label: '4th', value: '4' },
                  { label: 'Last', value: '-1' },
                ],
                required,
                admin: {
                  condition: (
                    _data: Record<string, unknown>,
                    siblingData: Record<string, unknown>,
                  ) =>
                    siblingData?.recurrenceType === 'monthly' &&
                    siblingData?.monthlyMode === 'weekday',
                  isClearable: false,
                },
              } satisfies Field,
              {
                name: 'weekdayOfMonth',
                type: 'select',
                label: 'Day',
                defaultValue: '0',
                options: [
                  { label: 'Monday', value: '0' },
                  { label: 'Tuesday', value: '1' },
                  { label: 'Wednesday', value: '2' },
                  { label: 'Thursday', value: '3' },
                  { label: 'Friday', value: '4' },
                  { label: 'Saturday', value: '5' },
                  { label: 'Sunday', value: '6' },
                ],
                required,
                admin: {
                  condition: (
                    _data: Record<string, unknown>,
                    siblingData: Record<string, unknown>,
                  ) =>
                    siblingData?.recurrenceType === 'monthly' &&
                    siblingData?.monthlyMode === 'weekday',
                  isClearable: false,
                },
              } satisfies Field,
            ]
          : []),
      ],
    },

    // === Row 3: Ending Conditions ===
    ...(hasEnding
      ? [
          {
            type: 'row',
            fields: [
              {
                name: 'endingType',
                type: 'select',
                label: 'Ends',
                options: [...ENDING_OPTIONS],
                admin: {
                  condition: (
                    _data: Record<string, unknown>,
                    siblingData: Record<string, unknown>,
                  ) => !!siblingData?.recurrenceType,
                  placeholder: 'Never',
                },
              } satisfies Field,
              {
                name: 'count',
                type: 'number',
                label: 'Occurrences',
                defaultValue: 10,
                min: 1,
                max: 999,
                required,
                admin: {
                  step: 1,
                  condition: (
                    _data: Record<string, unknown>,
                    siblingData: Record<string, unknown>,
                  ) =>
                    !!siblingData?.recurrenceType && siblingData?.endingType === 'count',
                },
              } satisfies Field,
              {
                name: 'untilDate',
                type: 'date',
                label: 'End Date',
                required,
                admin: {
                  condition: (
                    _data: Record<string, unknown>,
                    siblingData: Record<string, unknown>,
                  ) =>
                    !!siblingData?.recurrenceType && siblingData?.endingType === 'until',
                  date: {
                    pickerAppearance: 'dayOnly',
                    displayFormat: 'MMM d, yyyy',
                  },
                },
              } satisfies Field,
            ],
          } satisfies Field,
        ]
      : []),

    // === Virtual RRULE (computed on read, not stored) ===
    {
      name: 'rrule',
      type: 'text',
      virtual: true,
      admin: { hidden: true },
      hooks: {
        afterRead: [computeRRule],
      },
    },

    // === Virtual upcoming dates (computed on read, not stored) ===
    {
      name: 'upcomingDates',
      type: 'json',
      virtual: true,
      admin: { hidden: true },
      hooks: {
        afterRead: [computeUpcomingDates],
      },
    },
  ]

  return fields
}
