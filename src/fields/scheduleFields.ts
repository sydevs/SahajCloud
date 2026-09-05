import type { Field, GroupField, JSONField } from 'payload'

import {
  cleanupExpiredExclusions,
  computeIcalRule,
  computeLastDate,
  computeUpcomingDates,
  getLocalTimeHHMM,
} from '@/lib/schedule/scheduleHooks'

/**
 * Field factory options
 */
export interface ScheduleFieldsOptions {
  /** Field name (default: 'schedule') */
  name?: string
  /** Field label (default: 'Schedule', false to hide) */
  label?: false | string
  /** Whether sub-fields are required (default: true) */
  required?: boolean
  /** Show end time field (default: false) */
  hasEndTime?: boolean
  /** Show weekday picker for weekly recurrence (default: false) */
  hasComplexWeekly?: boolean
  /** Show day/weekday picker for monthly recurrence (default: false) */
  hasComplexMonthly?: boolean
  /** Show ending conditions — count or until date (default: false) */
  hasEnding?: boolean
  /** Show exclusion date ranges for recurring events (default: false) */
  hasExclusions?: boolean
  /** Admin configuration (uses PayloadCMS JSONField admin type) */
  admin?: Partial<JSONField['admin']>
}

/** Internal configuration for sub-field builders */
type SubFieldConfig = Omit<ScheduleFieldsOptions, 'name' | 'label' | 'admin'>

/**
 * Weekday options for the multi-select field
 */
const WEEKDAY_OPTIONS = [
  { label: 'Mon', value: 'MO' },
  { label: 'Tue', value: 'TU' },
  { label: 'Wed', value: 'WE' },
  { label: 'Thu', value: 'TH' },
  { label: 'Fri', value: 'FR' },
  { label: 'Sat', value: 'SA' },
  { label: 'Sun', value: 'SU' },
]

/**
 * Recurrence type options
 */
const RECURRENCE_OPTIONS = [
  { label: 'Daily', value: 'DAILY' },
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'Monthly', value: 'MONTHLY' },
]

/**
 * Ending type options
 */
const ENDING_OPTIONS = [
  { label: 'After', value: 'count' },
  { label: 'On Date', value: 'until' },
]

/**
 * Creates a schedule field for event scheduling with datetime, timezone,
 * and iCalendar RRULE support.
 *
 * Returns a Group field with native PayloadCMS sub-fields that store
 * directly in individual database columns. Includes virtual `icalRule`
 * and `upcomingDates` fields computed on read.
 *
 * Core fields (always present): firstDate (with timezone picker),
 * recurrenceType, interval, icalRule (virtual), upcomingDates (virtual).
 *
 * The `firstDate` field uses PayloadCMS's `timezone: true` option which
 * stores the datetime in UTC and auto-creates a companion `firstDate_tz`
 * field for the timezone.
 *
 * A `ScheduleSummary` beforeInput component displays a human-readable
 * description of the configured recurrence below the group fields,
 * updating in real-time as the user edits sub-fields.
 *
 * Feature flags enable additional field groups:
 * - `endTime` — end time field
 * - `complexWeekly` — weekday picker for weekly recurrence
 * - `complexMonthly` — day/weekday picker for monthly recurrence
 * - `ending` — ending conditions (count or until date)
 * - `exclusions` — exclusion date ranges for recurring events
 *
 * @example Basic usage (core fields only)
 * ```typescript
 * fields: [
 *   scheduleFields({ name: 'schedule' }),
 * ]
 * ```
 *
 * @example With feature flags
 * ```typescript
 * fields: [
 *   scheduleFields({
 *     name: 'schedule',
 *     hasEndTime: true,
 *     hasEnding: true,
 *   }),
 * ]
 * ```
 */
export function scheduleFields(options: ScheduleFieldsOptions = {}): Field {
  const {
    name = 'schedule',
    label = 'Schedule',
    required = true,
    hasEndTime = false,
    hasComplexWeekly = false,
    hasComplexMonthly = false,
    hasEnding = false,
    hasExclusions = false,
    admin = {},
  } = options

  const subFields = buildScheduleSubFields({
    required,
    hasEndTime,
    hasComplexWeekly,
    hasComplexMonthly,
    hasEnding,
    hasExclusions,
  })

  const groupField: GroupField = {
    name,
    type: 'group',
    label,
    admin: {
      description: admin.description || 'Configure when this event occurs and repeats',
      condition: admin.condition,
      components: {
        beforeInput: ['@/components/admin/ScheduleSummary'],
      },
    },
    fields: subFields,
  }

  return groupField
}

// ─── Row Builders ─────────────────────────────────────────────────────

/**
 * Row 1: firstDate (with timezone picker) + optional endTime
 */
function buildDateTimeRow({ required, hasEndTime }: SubFieldConfig): Field {
  return {
    type: 'row',
    fields: [
      {
        name: 'firstDate',
        type: 'date',
        label: 'First Date & Time',
        required,
        timezone: true,
        admin: {
          date: {
            pickerAppearance: 'dayAndTime',
            displayFormat: 'MMM d, yyyy HH:mm',
          },
        },
      },
      ...(hasEndTime ? [buildEndTimeField()] : []),
    ],
  }
}

/**
 * End time text field with HH:MM validation and start-time comparison.
 */
function buildEndTimeField(): Field {
  return {
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
      // End time must be after start time (extracted from firstDate UTC + timezone)
      const firstDate = siblingData?.firstDate as string | undefined
      const firstDateTz = siblingData?.firstDate_tz as string | undefined
      if (firstDate && firstDateTz) {
        const startTimeStr = getLocalTimeHHMM(firstDate, firstDateTz)
        // Pad to 2-digit hours (regex allows "9:30") for reliable comparison
        // HH:MM in 24-hour format is lexicographically ordered
        if (startTimeStr && value.padStart(5, '0') <= startTimeStr) {
          return 'End time must be after start time'
        }
      }
      return true
    },
  }
}

/**
 * Row 2: recurrenceType + interval + optional complex weekly/monthly fields
 */
function buildRecurrenceRow(config: SubFieldConfig): Field {
  return {
    type: 'row',
    fields: [
      {
        name: 'recurrenceType',
        type: 'select',
        label: 'Repeats',
        options: RECURRENCE_OPTIONS,
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
        required: config.required,
        admin: {
          step: 1,
          condition: (_data, siblingData) => !!siblingData?.recurrenceType,
          description: 'Repeat every N days/weeks/months',
        },
      },
      ...(config.hasComplexWeekly ? buildComplexWeeklyFields(config) : []),
      ...(config.hasComplexMonthly ? buildComplexMonthlyFields(config) : []),
    ],
  }
}

/**
 * Weekday multi-select for weekly recurrence (complexWeekly flag).
 */
function buildComplexWeeklyFields({ required }: SubFieldConfig): Field[] {
  return [
    {
      name: 'weekdays',
      type: 'select',
      hasMany: true,
      label: 'On Days',
      options: WEEKDAY_OPTIONS,
      required,
      admin: {
        condition: (_data, siblingData) => siblingData?.recurrenceType === 'WEEKLY',
      },
    },
  ]
}

/**
 * Monthly mode fields: by date (monthDay) or by weekday (weekNumber + weekdayOfMonth).
 */
function buildComplexMonthlyFields({ required }: SubFieldConfig): Field[] {
  return [
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
        condition: (_data, siblingData) => siblingData?.recurrenceType === 'MONTHLY',
        isClearable: false,
      },
    },
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
        condition: (_data, siblingData) =>
          siblingData?.recurrenceType === 'MONTHLY' && siblingData?.monthlyMode === 'date',
        description: 'Day of the month (1-31)',
      },
    },
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
        condition: (_data, siblingData) =>
          siblingData?.recurrenceType === 'MONTHLY' && siblingData?.monthlyMode === 'weekday',
        isClearable: false,
      },
    },
    {
      name: 'weekdayOfMonth',
      type: 'select',
      label: 'Day',
      defaultValue: 'MO',
      options: [
        { label: 'Monday', value: 'MO' },
        { label: 'Tuesday', value: 'TU' },
        { label: 'Wednesday', value: 'WE' },
        { label: 'Thursday', value: 'TH' },
        { label: 'Friday', value: 'FR' },
        { label: 'Saturday', value: 'SA' },
        { label: 'Sunday', value: 'SU' },
      ],
      required,
      admin: {
        condition: (_data, siblingData) =>
          siblingData?.recurrenceType === 'MONTHLY' && siblingData?.monthlyMode === 'weekday',
        isClearable: false,
      },
    },
  ]
}

/**
 * Optional Row 3: ending conditions (count or until date).
 */
function buildEndingRow({ required, hasEnding }: SubFieldConfig): Field[] {
  if (!hasEnding) return []

  return [
    {
      type: 'row',
      fields: [
        {
          name: 'endingType',
          type: 'select',
          label: 'Ends',
          options: ENDING_OPTIONS,
          admin: {
            condition: (_data, siblingData) => !!siblingData?.recurrenceType,
            placeholder: 'Never',
          },
        },
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
            condition: (_data, siblingData) =>
              !!siblingData?.recurrenceType && siblingData?.endingType === 'count',
          },
        },
        {
          name: 'untilDate',
          type: 'date',
          label: 'End Date',
          required,
          admin: {
            condition: (_data, siblingData) =>
              !!siblingData?.recurrenceType && siblingData?.endingType === 'until',
            date: {
              pickerAppearance: 'dayOnly',
              displayFormat: 'MMM d, yyyy',
            },
          },
        },
      ],
    },
  ]
}

/**
 * Optional exclusion date ranges array field.
 * Shown only when recurrenceType is set (exclusions only apply to recurring events).
 */
function buildExclusionsField({ hasExclusions }: SubFieldConfig): Field[] {
  if (!hasExclusions) return []

  return [
    {
      name: 'exclusions',
      type: 'array',
      label: 'Scheduled Breaks',
      labels: { singular: 'Break', plural: 'Breaks' },
      admin: {
        description:
          'Dates when this recurring event will not occur, such as holidays or seasonal breaks.',
        condition: (_data, siblingData) => !!siblingData?.recurrenceType,
        components: {
          Field: '@/components/admin/FlatArrayField',
        },
      },
      hooks: {
        beforeChange: [cleanupExpiredExclusions],
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'startDate',
              type: 'date',
              required: true,
              admin: {
                width: '25%',
                date: {
                  pickerAppearance: 'dayOnly',
                },
              },
            },
            {
              name: 'endDate',
              type: 'date',
              admin: {
                width: '25%',
                date: {
                  pickerAppearance: 'dayOnly',
                },
              },
              validate: (
                value: Date | null | undefined,
                { siblingData }: { siblingData: Record<string, unknown> },
              ) => {
                if (!value) return true // Optional field
                const startDate = siblingData?.startDate as Date | string | undefined
                if (!startDate) return true
                // Compare dates: both may be Date objects or ISO strings
                const endTime = value instanceof Date ? value.getTime() : new Date(value).getTime()
                const startTime =
                  startDate instanceof Date ? startDate.getTime() : new Date(startDate).getTime()
                if (endTime < startTime) {
                  return 'End date must be on or after start date'
                }
                return true
              },
            },
            {
              name: 'reason',
              type: 'text',
              admin: {
                width: '50%',
                placeholder: 'e.g., Summer break, Public holiday',
              },
            },
          ],
        },
      ],
    },
  ]
}

/**
 * Stored derived column: the end of the schedule's final occurrence (local
 * end-of-day, as a UTC instant), or `null` for an open-ended recurrence.
 *
 * Recomputed by `computeLastDate` on every write and never editable — a real
 * column rather than a virtual field precisely so "has this schedule run out?"
 * can appear in a `where` (see `@/lib/schedule/scheduleStatus`). Indexed: the
 * public event feeds filter on it on every read.
 */
function buildLastDateField(): Field {
  return {
    name: 'lastDate',
    type: 'date',
    index: true,
    admin: { hidden: true },
    hooks: {
      beforeChange: [computeLastDate],
    },
  }
}

/**
 * Virtual fields computed on read (not stored in database).
 */
function buildVirtualFields(): Field[] {
  return [
    {
      name: 'icalRule',
      type: 'text',
      virtual: true,
      admin: { hidden: true },
      hooks: {
        afterRead: [computeIcalRule],
      },
    },
    {
      // Virtual: written by the hook below; typed at its source
      // (`computeUpcomingDates` in `@/lib/schedule/scheduleHooks`).
      // See `src/collections/AGENTS.md`.
      name: 'upcomingDates',
      type: 'json',
      virtual: true,
      admin: { hidden: true },
      hooks: {
        afterRead: [computeUpcomingDates],
      },
    },
  ]
}

// ─── Composer ─────────────────────────────────────────────────────────

/**
 * Build the sub-fields for the schedule group based on feature flags.
 */
function buildScheduleSubFields(config: SubFieldConfig): Field[] {
  return [
    buildDateTimeRow(config),
    buildRecurrenceRow(config),
    ...buildEndingRow(config),
    ...buildExclusionsField(config),
    buildLastDateField(),
    ...buildVirtualFields(),
  ]
}
