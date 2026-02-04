/**
 * Schedule Field Hooks
 *
 * Computes virtual fields from the Group field sub-fields:
 * - `rrule`: iCalendar RRULE string
 * - `upcomingDates`: Next 10 occurrences from now as ISO 8601 strings
 *
 * The `firstDate` field stores a UTC datetime, and `firstDate_tz` stores
 * the IANA timezone. Hooks convert UTC → local time using `Intl.DateTimeFormat`
 * before constructing rrule instances with the `tzid` option.
 *
 * NOTE: The UTC → local conversion via getLocalComponents() is essential.
 * The rrule library's `tzid` mode expects dtstart to have local time values
 * in its UTC slots. Without this conversion, rrule would misinterpret the
 * raw UTC values as local time, producing incorrect results for non-UTC
 * timezones and DST transitions.
 *
 * @see https://icalendar.org/iCalendar-RFC-5545/3-8-5-3-recurrence-rule.html
 */

import type { FieldHook } from 'payload'
import type { Options as RRuleOptions, RRule as RRuleType, Weekday as WeekdayType } from 'rrule'

import { createRequire } from 'node:module'

/**
 * Sub-field structure matching the PayloadCMS Group field sub-fields.
 */
interface ScheduleSubFields {
  firstDate: string
  firstDate_tz?: string
  endTime?: string
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
const RRule: typeof RRuleType = rruleModule.RRule
const Weekday: typeof WeekdayType = rruleModule.Weekday

/** Number of upcoming occurrences to compute */
const UPCOMING_COUNT = 10

/** Maximum months ahead to search for occurrences */
const MAX_MONTHS_AHEAD = 6

/**
 * Map RecurrenceType to rrule frequency constants.
 */
const FREQ_MAP: Record<string, number> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
}

/**
 * Convert a UTC datetime string to local time components in a given timezone.
 *
 * Uses `Intl.DateTimeFormat` which is available in all target environments
 * (Node.js, Cloudflare Workers) without additional dependencies.
 */
function getLocalComponents(
  utcDateStr: string,
  timezone: string,
): { year: number; month: number; day: number; hours: number; minutes: number } | null {
  const date = new Date(utcDateStr)
  if (isNaN(date.getTime())) return null

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type)
    return part ? parseInt(part.value, 10) : 0
  }

  // Intl returns hour 24 for midnight in hour12:false mode — normalize to 0
  const rawHour = get('hour')

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hours: rawHour === 24 ? 0 : rawHour,
    minutes: get('minute'),
  }
}

/**
 * Extract local time as HH:MM from a UTC datetime + timezone.
 * Exported for use in field validation (endTime comparison).
 */
export function getLocalTimeHHMM(utcDateStr: string, timezone: string): string | null {
  const components = getLocalComponents(utcDateStr, timezone)
  if (!components) return null
  const h = String(components.hours).padStart(2, '0')
  const m = String(components.minutes).padStart(2, '0')
  return `${h}:${m}`
}

/**
 * Check whether the schedule sub-fields describe a recurring event.
 */
function isRecurring(fields: Partial<ScheduleSubFields>): boolean {
  return !!fields.recurrenceType && !!FREQ_MAP[fields.recurrenceType]
}

/**
 * Build an RRule instance from schedule sub-fields.
 *
 * For recurring events (recurrenceType matches a supported frequency),
 * returns a full RRule with interval, weekdays, monthly mode, and ending
 * conditions.
 *
 * For one-off events (no recurrenceType or unsupported type), returns a
 * single-occurrence RRule for timezone-correct date handling.
 *
 * Returns null only when firstDate is missing or invalid.
 */
function buildRRule(fields: Partial<ScheduleSubFields>): RRuleType | null {
  if (!fields.firstDate) return null

  const timezone = fields.firstDate_tz || 'UTC'
  const local = getLocalComponents(fields.firstDate, timezone)
  if (!local) return null

  // Build dtstart as a Date with local values in UTC slots.
  // rrule's `tzid` mode reads UTC values from the Date and treats them as local
  // time in the specified timezone. Without this step, rrule would misinterpret
  // the raw UTC time (e.g., 13:00Z instead of the intended 09:00 EDT).
  const dtstart = new Date(
    Date.UTC(local.year, local.month - 1, local.day, local.hours, local.minutes, 0),
  )

  // Non-recurring: single occurrence for timezone-correct date handling
  const freq = isRecurring(fields) ? FREQ_MAP[fields.recurrenceType!] : undefined
  if (!freq) {
    return new RRule({ freq: RRule.DAILY, dtstart, tzid: timezone, count: 1 })
  }

  // Recurring event
  const options: Partial<RRuleOptions> = { freq, dtstart, tzid: timezone }

  // Interval
  const interval = fields.interval ?? 1
  if (interval > 1) {
    options.interval = interval
  }

  // Weekly: weekdays
  if (fields.recurrenceType === 'weekly' && fields.weekdays && fields.weekdays.length > 0) {
    options.byweekday = fields.weekdays.map((w) => parseInt(w, 10))
  }

  // Monthly: by date or by weekday
  if (fields.recurrenceType === 'monthly') {
    const monthlyMode = fields.monthlyMode || 'date'
    if (monthlyMode === 'date') {
      options.bymonthday = fields.monthDay ?? local.day
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
    const untilStr = fields.untilDate.includes('T')
      ? fields.untilDate.split('T')[0]
      : fields.untilDate
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
 * Returns the full RRULE string (including DTSTART) for both recurring
 * and one-off events. One-off events produce a single-occurrence RRULE
 * (FREQ=DAILY;COUNT=1). Returns null only when firstDate is missing.
 */
export const computeRRule: FieldHook = ({ siblingData }) => {
  const fields = siblingData as Partial<ScheduleSubFields>
  const rule = buildRRule(fields)
  return rule ? rule.toString() : null
}

/**
 * afterRead hook: Compute next upcoming occurrences from schedule sub-fields.
 *
 * Returns an array of up to 10 ISO 8601 date strings representing the next
 * occurrences from the current time. Handles both recurring and one-off events:
 * - Recurring: uses rrule's `between()` with early termination
 * - One-off: returns a single-element array if the event is in the future
 * - Returns `null` only when firstDate is missing (no event data)
 * - Returns `[]` when the event (or all occurrences) are in the past
 */
export const computeUpcomingDates: FieldHook = ({ siblingData }) => {
  const fields = siblingData as Partial<ScheduleSubFields>
  const rule = buildRRule(fields)
  if (!rule) return null

  const now = new Date()

  if (isRecurring(fields)) {
    const endDate = new Date(now)
    endDate.setMonth(endDate.getMonth() + MAX_MONTHS_AHEAD)

    const occurrences: Date[] = []

    rule.between(now, endDate, true, (date: Date) => {
      occurrences.push(date)
      return occurrences.length < UPCOMING_COUNT
    })

    return occurrences.map((d: Date) => d.toISOString())
  }

  // One-off event: return the event date if it's in the future
  const dates = rule.all()
  if (dates.length > 0 && dates[0] > now) {
    return [dates[0].toISOString()]
  }

  return []
}
