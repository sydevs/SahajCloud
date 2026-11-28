import type { Field, GroupField, JSONField } from 'payload'

import { z } from 'zod'

import { RECURRENCE_OPTIONS } from '@/lib/schedule/recurrence'
import {
  cleanupExpiredExclusions,
  computeIcalRule,
  computeLastDate,
  computeUpcomingDates,
  getLocalTimeHHMM,
} from '@/lib/schedule/scheduleHooks'
import { isHHMM } from '@/lib/schedule/time'

import { jsonField } from './jsonField'

export interface ScheduleFieldsOptions {
  /** Default `schedule`. */
  name?: string
  /** Default `Schedule`; `false` hides it. */
  label?: false | string
  /** Default true. */
  required?: boolean
  hasEndTime?: boolean
  /** Weekday picker for weekly recurrence. */
  hasComplexWeekly?: boolean
  /** Day-or-weekday picker for monthly recurrence. */
  hasComplexMonthly?: boolean
  /** Count, or an until date. */
  hasEnding?: boolean
  /** Date ranges the recurrence skips. */
  hasExclusions?: boolean
  /**
   * Show the group's own Repeats select and its summary banner (default: true).
   * A caller that renders its own control turns this off: its control writes
   * `recurrenceType` in the form, and it places `ScheduleSummary` above it.
   */
  hasRecurrenceControl?: boolean
  admin?: Partial<JSONField['admin']>
}

type SubFieldConfig = Omit<ScheduleFieldsOptions, 'name' | 'label' | 'admin'>

/** ⚠ Temporal `dayOfWeek` order: the class import reads a code as `[dayOfWeek - 1]`. */
export const WEEKDAY_OPTIONS = [
  { label: 'Mon', value: 'MO' },
  { label: 'Tue', value: 'TU' },
  { label: 'Wed', value: 'WE' },
  { label: 'Thu', value: 'TH' },
  { label: 'Fri', value: 'FR' },
  { label: 'Sat', value: 'SA' },
  { label: 'Sun', value: 'SU' },
] as const

const ENDING_OPTIONS = [
  { label: 'After', value: 'count' },
  { label: 'On Date', value: 'until' },
]

/** A group of datetime, timezone and RRULE sub-fields. Used by Events and AppCards. */
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
    hasRecurrenceControl = true,
    admin = {},
  } = options

  const subFields = buildScheduleSubFields({
    required,
    hasEndTime,
    hasComplexWeekly,
    hasComplexMonthly,
    hasEnding,
    hasExclusions,
    hasRecurrenceControl,
  })

  const groupField: GroupField = {
    name,
    type: 'group',
    label,
    admin: {
      description: admin.description || 'Configure when this event occurs and repeats',
      condition: admin.condition,
      ...(hasRecurrenceControl && {
        components: { beforeInput: ['@/components/admin/ScheduleSummary'] },
      }),
    },
    fields: subFields,
  }

  return groupField
}

// ─── Row Builders ─────────────────────────────────────────────────────

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
      if (!value) return true
      // Shared with the bulk import, which writes through this field: two
      // independent patterns meant a CSV row could be accepted and then
      // refused at write. See `@/lib/schedule/time`.
      if (!isHHMM(value)) {
        return 'Enter time in HH:MM format (e.g., 17:00)'
      }
      const firstDate = siblingData?.firstDate as string | undefined
      const firstDateTz = siblingData?.firstDate_tz as string | undefined
      if (firstDate && firstDateTz) {
        const startTimeStr = getLocalTimeHHMM(firstDate, firstDateTz)
        // Padded because the regex admits "9:30", and 24-hour HH:MM then sorts
        // lexicographically.
        if (startTimeStr && value.padStart(5, '0') <= startTimeStr) {
          return 'End time must be after start time'
        }
      }
      return true
    },
  }
}

function buildRecurrenceFields(config: SubFieldConfig): Field[] {
  const recurrenceType: Field = {
    name: 'recurrenceType',
    type: 'select',
    label: 'Repeats',
    options: [...RECURRENCE_OPTIONS],
    admin: {
      // Hidden, not dropped: a caller's own control writes it.
      hidden: !config.hasRecurrenceControl,
      placeholder: 'Does not repeat',
    },
  }
  const paceFields: Field[] = [
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
        components: { Label: '@/components/admin/ScheduleSummary/IntervalLabel' },
      },
    },
    ...(config.hasComplexWeekly ? buildComplexWeeklyFields(config) : []),
    ...(config.hasComplexMonthly ? buildComplexMonthlyFields(config) : []),
  ]
  if (config.hasRecurrenceControl) return [{ type: 'row', fields: [recurrenceType, ...paceFields] }]
  // An empty row still takes a gap, so a one-time schedule would open on blank space.
  return [
    recurrenceType,
    {
      type: 'row',
      admin: { condition: (_data, siblingData) => !!siblingData?.recurrenceType },
      fields: paceFields,
    },
  ]
}

function buildComplexWeeklyFields({ required }: SubFieldConfig): Field[] {
  return [
    {
      name: 'weekdays',
      type: 'select',
      hasMany: true,
      label: 'On Days',
      options: [...WEEKDAY_OPTIONS],
      required,
      admin: {
        condition: (_data, siblingData) => siblingData?.recurrenceType === 'WEEKLY',
      },
    },
  ]
}

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

/** Shown only with a recurrence, which is the only thing an exclusion can skip. */
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
                if (!value) return true
                const startDate = siblingData?.startDate as Date | string | undefined
                if (!startDate) return true
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
 * The end of the final occurrence (local end-of-day as a UTC instant), or `null`
 * for an open-ended recurrence.
 *
 * A real column rather than a virtual field precisely so "has this schedule run
 * out?" can appear in a `where` (see `@/lib/schedule/scheduleStatus`). Indexed:
 * the public event feeds filter on it on every read.
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
    jsonField({
      // Virtual: written by `computeUpcomingDates`, never stored. The schema
      // exists for the generated type. See `src/collections/AGENTS.md`.
      name: 'upcomingDates',
      virtual: true,
      schemaTitle: 'ScheduleUpcomingDates',
      // Closed because that hook is the only writer and the column is
      // virtual — nothing stores it, so no row holds an earlier shape.
      schema: z.array(z.string().describe('ISO 8601 UTC instant of one occurrence.')),
      admin: { hidden: true },
      hooks: {
        afterRead: [computeUpcomingDates],
      },
    }),
  ]
}

// ─── Composer ─────────────────────────────────────────────────────────

function buildScheduleSubFields(config: SubFieldConfig): Field[] {
  return [
    buildDateTimeRow(config),
    ...buildRecurrenceFields(config),
    ...buildEndingRow(config),
    ...buildExclusionsField(config),
    buildLastDateField(),
    ...buildVirtualFields(),
  ]
}
