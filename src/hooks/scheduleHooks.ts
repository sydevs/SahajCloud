/**
 * Schedule Field Hooks
 *
 * Computes virtual fields from the Group field sub-fields:
 * - `rrule`: iCalendar RRULE string (DTSTART;TZID=... + RRULE:FREQ=...)
 * - `upcomingDates`: Next 10 occurrences from now as ISO 8601 UTC strings
 *
 * Uses `rrule-temporal` for timezone-correct recurrence expansion via the
 * Temporal API. Unlike the legacy `rrule` library, rrule-temporal handles
 * DST transitions natively through `Temporal.ZonedDateTime`, eliminating
 * the double-timezone-conversion bug that caused incorrect UTC times.
 *
 * Field values are stored in RFC 5545 conventions (uppercase DAILY/WEEKLY/
 * MONTHLY, two-letter weekday codes MO-SU) to minimize mapping logic.
 *
 * @see https://icalendar.org/iCalendar-RFC-5545/3-8-5-3-recurrence-rule.html
 * @see https://github.com/ggaabe/rrule-temporal
 */

import type { FieldHook } from 'payload'

import { Temporal } from '@js-temporal/polyfill'
import { type RRuleOptions, RRuleTemporal } from 'rrule-temporal'

/**
 * Sub-field structure matching the PayloadCMS Group field sub-fields.
 * Values use RFC 5545 conventions: uppercase frequencies, two-letter day codes.
 */
interface ScheduleSubFields {
  firstDate: string
  firstDate_tz?: string
  endTime?: string
  recurrenceType?: 'DAILY' | 'WEEKLY' | 'MONTHLY'
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

/** Number of upcoming occurrences to compute */
const UPCOMING_COUNT = 10

/** Maximum months ahead to search for occurrences */
const MAX_MONTHS_AHEAD = 6

/** Supported recurrence types */
const SUPPORTED_FREQ = new Set(['DAILY', 'WEEKLY', 'MONTHLY'])

/**
 * Extract local time as HH:MM from a UTC datetime + timezone.
 * Exported for use in field validation (endTime comparison).
 */
export function getLocalTimeHHMM(utcDateStr: string, timezone: string): string | null {
  try {
    const zdt = Temporal.Instant.from(utcDateStr).toZonedDateTimeISO(timezone)
    return `${String(zdt.hour).padStart(2, '0')}:${String(zdt.minute).padStart(2, '0')}`
  } catch {
    return null
  }
}

/**
 * Check whether the schedule sub-fields describe a recurring event.
 */
function isRecurring(fields: Partial<ScheduleSubFields>): boolean {
  return !!fields.recurrenceType && SUPPORTED_FREQ.has(fields.recurrenceType)
}

/**
 * Build an RRuleTemporal instance from schedule sub-fields.
 *
 * For recurring events, returns a full rule with interval, weekdays,
 * monthly mode, and ending conditions.
 *
 * For one-off events, returns a single-occurrence rule (FREQ=DAILY;COUNT=1)
 * for timezone-correct date handling.
 *
 * Returns null only when firstDate is missing or invalid.
 */
function buildRRuleTemporal(fields: Partial<ScheduleSubFields>): RRuleTemporal | null {
  if (!fields.firstDate) return null

  const timezone = fields.firstDate_tz || 'UTC'

  let dtstart: Temporal.ZonedDateTime
  try {
    dtstart = Temporal.Instant.from(fields.firstDate).toZonedDateTimeISO(timezone)
  } catch {
    return null
  }

  // Non-recurring: single occurrence for timezone-correct date handling
  if (!isRecurring(fields)) {
    return new RRuleTemporal({ freq: 'DAILY', dtstart, tzid: timezone, count: 1 })
  }

  // Recurring event — freq is already uppercase from stored field values
  const freq = fields.recurrenceType!

  // Build byDay/byMonthDay based on recurrence type
  let byDay: string[] | undefined
  let byMonthDay: number[] | undefined

  if (fields.recurrenceType === 'WEEKLY' && fields.weekdays && fields.weekdays.length > 0) {
    byDay = fields.weekdays
  }

  if (fields.recurrenceType === 'MONTHLY') {
    const monthlyMode = fields.monthlyMode || 'date'
    if (monthlyMode === 'date') {
      byMonthDay = [fields.monthDay ?? dtstart.day]
    } else {
      const weekNum = parseInt(fields.weekNumber || '1', 10)
      byDay = [`${weekNum}${fields.weekdayOfMonth || 'MO'}`]
    }
  }

  // Build ending conditions
  const endingType = fields.endingType || 'never'
  let count: number | undefined
  let until: Temporal.ZonedDateTime | undefined

  if (endingType === 'count' && fields.count && fields.count > 0) {
    count = fields.count
  } else if (endingType === 'until' && fields.untilDate) {
    const untilStr = fields.untilDate.includes('T')
      ? fields.untilDate.split('T')[0]
      : fields.untilDate
    if (untilStr) {
      const [uy, um, ud] = untilStr.split('-').map(Number)
      until = Temporal.ZonedDateTime.from({
        year: uy,
        month: um,
        day: ud,
        hour: 23,
        minute: 59,
        timeZone: timezone,
      })
    }
  }

  const interval = fields.interval ?? 1

  const options: RRuleOptions = {
    freq,
    dtstart,
    tzid: timezone,
    ...(interval > 1 && { interval }),
    ...(byDay && { byDay }),
    ...(byMonthDay && { byMonthDay }),
    ...(count !== undefined && { count }),
    ...(until && { until }),
  }

  return new RRuleTemporal(options)
}

/**
 * afterRead hook: Compute RRULE string from schedule sub-fields.
 *
 * Returns the full RRULE string (including DTSTART;TZID) for both recurring
 * and one-off events. Uses rrule-temporal's toString() which produces
 * standards-compliant RFC 5545 output.
 *
 * Returns null only when firstDate is missing.
 */
export const computeRRule: FieldHook = ({ siblingData }) => {
  const fields = siblingData as Partial<ScheduleSubFields>
  const rule = buildRRuleTemporal(fields)
  return rule ? rule.toString() : null
}

/**
 * afterRead hook: Compute next upcoming occurrences from schedule sub-fields.
 *
 * Returns an array of up to 10 ISO 8601 UTC date strings representing the
 * next occurrences from the current time. Handles both recurring and one-off
 * events with correct DST handling via rrule-temporal's Temporal API:
 * - Recurring: uses between() which returns timezone-aware ZonedDateTime[]
 * - One-off: returns a single-element array if the event is in the future
 * - Returns `[]` when firstDate is missing or invalid (no event data)
 * - Returns `[]` when the event (or all occurrences) are in the past
 */
export const computeUpcomingDates: FieldHook = ({ siblingData }) => {
  const fields = siblingData as Partial<ScheduleSubFields>
  const rule = buildRRuleTemporal(fields)
  if (!rule) return []

  const now = new Date()

  if (isRecurring(fields)) {
    const endDate = new Date(now)
    endDate.setMonth(endDate.getMonth() + MAX_MONTHS_AHEAD)

    const occurrences = rule.between(now, endDate, true)

    return occurrences
      .slice(0, UPCOMING_COUNT)
      .map((zdt) => new Date(Number(zdt.epochMilliseconds)).toISOString())
  }

  // One-off event: return the event date if it's in the future
  const dates = rule.all()
  if (dates.length > 0) {
    const utcMs = Number(dates[0].epochMilliseconds)
    if (utcMs > now.getTime()) {
      return [new Date(utcMs).toISOString()]
    }
  }

  return []
}
