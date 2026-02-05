/**
 * Schedule Field Hooks
 *
 * Computes virtual fields from the Group field sub-fields:
 * - `icalRule`: iCalendar string (DTSTART;TZID=... + RRULE:FREQ=... + optional EXDATE:...)
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
 * A single exclusion date range within the exclusions array.
 * When endDate is omitted, only startDate is excluded (single-date exclusion).
 */
export interface ExclusionRange {
  startDate: string // YYYY-MM-DD or ISO datetime
  endDate?: string // YYYY-MM-DD or ISO datetime, optional
  reason?: string
  id?: string // PayloadCMS array item ID
}

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
  exclusions?: ExclusionRange[]
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
 * Parse a date string to Temporal.PlainDate.
 * Handles both YYYY-MM-DD and ISO datetime formats (PayloadCMS dayOnly
 * fields may store full ISO datetime strings like "2025-03-17T00:00:00.000Z").
 * Returns null for invalid input.
 */
function parseDateOnly(dateStr: string): Temporal.PlainDate | null {
  try {
    const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr
    return Temporal.PlainDate.from(datePart)
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
 * Expand exclusion date ranges into individual exDate entries for rrule-temporal.
 *
 * For each exclusion range, finds all occurrences of the base rule that fall
 * within the range by comparing the occurrence's local calendar day (in the
 * event's timezone) against the exclusion range's calendar days. This ensures
 * correct behavior across DST transitions.
 *
 * When endDate is omitted, treats the range as [startDate, startDate].
 */
function expandExclusionRanges(
  baseRule: RRuleTemporal,
  exclusions: ExclusionRange[],
  timezone: string,
): Temporal.ZonedDateTime[] {
  const exDates: Temporal.ZonedDateTime[] = []

  for (const exclusion of exclusions) {
    const startPlain = parseDateOnly(exclusion.startDate)
    if (!startPlain) continue

    const endPlain = exclusion.endDate ? parseDateOnly(exclusion.endDate) : startPlain
    if (!endPlain) continue

    // Create search window in the event's timezone: start-of-day to end-of-day
    const windowStart = startPlain.toZonedDateTime({
      timeZone: timezone,
      plainTime: new Temporal.PlainTime(0, 0, 0),
    })
    const windowEnd = endPlain.toZonedDateTime({
      timeZone: timezone,
      plainTime: new Temporal.PlainTime(23, 59, 59),
    })

    // Find occurrences within this window
    const startDate = new Date(Number(windowStart.epochMilliseconds))
    const endDate = new Date(Number(windowEnd.epochMilliseconds))
    const occurrences = baseRule.between(startDate, endDate, true)

    // Filter by comparing occurrence's local calendar day against the range
    for (const occ of occurrences) {
      const occDate = occ.toPlainDate()
      if (
        Temporal.PlainDate.compare(occDate, startPlain) >= 0 &&
        Temporal.PlainDate.compare(occDate, endPlain) <= 0
      ) {
        exDates.push(occ)
      }
    }
  }

  return exDates
}

/**
 * Build an RRuleTemporal instance from schedule sub-fields.
 *
 * For recurring events, returns a full rule with interval, weekdays,
 * monthly mode, ending conditions, and optional exclusion dates.
 *
 * For one-off events, returns a single-occurrence rule (FREQ=DAILY;COUNT=1)
 * for timezone-correct date handling. Exclusions are ignored for one-off events.
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

  const baseRule = new RRuleTemporal(options)

  // Apply exclusion date ranges for recurring events
  if (fields.exclusions && fields.exclusions.length > 0) {
    const exDateEntries = expandExclusionRanges(baseRule, fields.exclusions, timezone)
    if (exDateEntries.length > 0) {
      return baseRule.with({ exDate: exDateEntries })
    }
  }

  return baseRule
}

/**
 * afterRead hook: Compute iCalendar rule string from schedule sub-fields.
 *
 * Returns the full iCalendar string (DTSTART;TZID + RRULE + optional EXDATE)
 * for both recurring and one-off events. Uses rrule-temporal's toString()
 * which produces standards-compliant RFC 5545 output.
 *
 * Returns null only when firstDate is missing.
 */
export const computeIcalRule: FieldHook = ({ siblingData }) => {
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
 *
 * Exclusion dates are automatically excluded by rrule-temporal's between()
 * and all() methods — no additional filtering is needed.
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

    // Number() cast: rrule-temporal returns epochMilliseconds as BigInt
    return occurrences
      .slice(0, UPCOMING_COUNT)
      .map((zdt) => new Date(Number(zdt.epochMilliseconds)).toISOString())
  }

  // One-off event: return the event date if it's in the future
  const dates = rule.all()
  if (dates.length > 0) {
    const utcMs = Number(dates[0].epochMilliseconds) // BigInt → number
    if (utcMs > now.getTime()) {
      return [new Date(utcMs).toISOString()]
    }
  }

  return []
}

/**
 * beforeChange field hook for the exclusions array.
 * Removes exclusion items whose effective end date (endDate or startDate for
 * single-date exclusions) is more than 1 day in the past (UTC).
 *
 * The 1-day grace period prevents premature cleanup near midnight.
 */
export const cleanupExpiredExclusions: FieldHook = ({ value }) => {
  if (!Array.isArray(value) || value.length === 0) return value

  const now = new Date()
  const gracePeriodMs = 24 * 60 * 60 * 1000 // 1 day

  return value.filter((item: ExclusionRange) => {
    const dateStr = item.endDate || item.startDate
    if (!dateStr) return true // Keep items without dates

    const parsed = parseDateOnly(dateStr)
    if (!parsed) return true // Keep unparseable items

    // Construct end-of-day UTC for the effective end date
    const endOfDayUtc = Date.UTC(parsed.year, parsed.month - 1, parsed.day, 23, 59, 59, 999)

    // Keep if within grace period: endOfDay + grace >= now
    return now.getTime() - endOfDayUtc <= gracePeriodMs
  })
}
