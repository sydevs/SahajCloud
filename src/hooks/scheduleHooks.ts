/**
 * Schedule Field Hooks
 *
 * Computes virtual fields from the Group field sub-fields:
 * - `rrule`: iCalendar RRULE string
 * - `upcomingDates`: Next 10 occurrences from now as ISO 8601 strings
 *
 * Uses rrule.js with the `tzid` option for timezone-aware DTSTART.
 *
 * @see https://icalendar.org/iCalendar-RFC-5545/3-8-5-3-recurrence-rule.html
 */

import type { FieldHook } from 'payload'

import { createRequire } from 'node:module'

/**
 * Sub-field structure matching the PayloadCMS Group field sub-fields.
 */
interface ScheduleSubFields {
  startDate: string
  startTime: string
  endTime?: string
  timezone: string
  recurrenceType?: 'daily' | 'weekly' | 'monthly'
  interval?: number
  weekdays?: string[]
  monthDay?: number
  monthlyMode?: 'date' | 'weekday'
  weekNumber?: string
  weekdayOfMonth?: string
  endingType?: 'count' | 'until'
  count?: number
  untilDate?: string
}

// Use createRequire for rrule - ESM named exports don't work reliably,
// and bare `require` isn't available in Payload CLI's pure ESM context.
const _require = createRequire(import.meta.url)
const rruleModule = _require('rrule')
const RRule = rruleModule.RRule
const Weekday = rruleModule.Weekday

/** Number of upcoming occurrences to compute */
const UPCOMING_COUNT = 10

/** Maximum months ahead to search for occurrences */
const MAX_MONTHS_AHEAD = 6

/**
 * Map RecurrenceType to rrule frequency constants.
 * Replaces the separate RRULE_FREQ constants + recurrenceTypeToFrequency switch.
 */
const FREQ_MAP: Record<string, number | undefined> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
}

/**
 * Format date value to YYYY-MM-DD.
 */
function formatDateValue(value: string | null | undefined): string {
  if (!value) return ''
  return value.includes('T') ? value.split('T')[0] : value
}

/**
 * Build an RRule instance from schedule sub-fields.
 *
 * Returns the constructed RRule, or null if the event is not recurring
 * or required fields are missing.
 */
function buildRRule(fields: Partial<ScheduleSubFields>): InstanceType<typeof RRule> | null {
  const recurrenceType = fields.recurrenceType || 'none'
  if (recurrenceType === 'none') return null

  const freq = FREQ_MAP[recurrenceType]
  if (freq === undefined) return null

  const startDateStr = formatDateValue(fields.startDate)
  const startTime = fields.startTime
  if (!startDateStr || !startTime) return null

  // Build dtstart as a Date with local values in UTC slots.
  // rrule interprets these values relative to the provided tzid.
  const [year, month, day] = startDateStr.split('-').map(Number)
  const [hours, minutes] = startTime.split(':').map(Number)
  const dtstart = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0))

  const options: {
    freq: number
    dtstart: Date
    tzid: string
    interval?: number
    byweekday?: number[] | InstanceType<typeof Weekday>
    bymonthday?: number
    count?: number
    until?: Date
  } = {
    freq,
    dtstart,
    tzid: fields.timezone || 'UTC',
  }

  // Interval
  const interval = fields.interval ?? 1
  if (interval > 1) {
    options.interval = interval
  }

  // Weekly: weekdays
  if (recurrenceType === 'weekly' && fields.weekdays && fields.weekdays.length > 0) {
    options.byweekday = fields.weekdays.map((w) => parseInt(w, 10))
  }

  // Monthly: by date or by weekday
  if (recurrenceType === 'monthly') {
    const monthlyMode = fields.monthlyMode || 'date'
    if (monthlyMode === 'date') {
      options.bymonthday = fields.monthDay ?? day
    } else {
      const weekdayNum = parseInt(fields.weekdayOfMonth || '0', 10)
      const weekNum = parseInt(fields.weekNumber || '1', 10)
      options.byweekday = new Weekday(weekdayNum, weekNum)
    }
  }

  // Ending conditions
  const endingType = fields.endingType || 'never'
  if (endingType === 'count' && fields.count && fields.count > 0) {
    options.count = fields.count
  } else if (endingType === 'until' && fields.untilDate) {
    const untilStr = formatDateValue(fields.untilDate)
    if (untilStr) {
      const [uy, um, ud] = untilStr.split('-').map(Number)
      options.until = new Date(Date.UTC(uy, um - 1, ud, 23, 59, 0))
    }
  }

  return new RRule(options)
}

/**
 * afterRead hook: Compute RRULE string from schedule sub-fields.
 *
 * Returns the full RRULE string (including DTSTART) for recurring events,
 * or null for one-off events (recurrenceType === 'none').
 *
 * Uses rrule's `tzid` option so DTSTART is timezone-aware without
 * manual UTC conversion.
 */
export const computeRRule: FieldHook = ({ siblingData }) => {
  const rule = buildRRule(siblingData as Partial<ScheduleSubFields>)
  return rule ? rule.toString() : null
}

/**
 * afterRead hook: Compute next upcoming occurrences from schedule sub-fields.
 *
 * Returns an array of up to 10 ISO 8601 date strings representing the next
 * occurrences from the current time, or null for non-recurring events.
 *
 * Uses rrule's `between()` with an iterator callback for early termination,
 * avoiding computation of all occurrences.
 */
export const computeUpcomingDates: FieldHook = ({ siblingData }) => {
  const rule = buildRRule(siblingData as Partial<ScheduleSubFields>)
  if (!rule) return null

  const now = new Date()
  const endDate = new Date(now)
  endDate.setMonth(endDate.getMonth() + MAX_MONTHS_AHEAD)

  const occurrences: Date[] = []

  rule.between(now, endDate, true, (date: Date) => {
    occurrences.push(date)
    return occurrences.length < UPCOMING_COUNT
  })

  return occurrences.map((d: Date) => d.toISOString())
}
