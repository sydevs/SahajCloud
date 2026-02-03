/**
 * Utility functions for schedule field RRULE generation and parsing
 *
 * Uses rrule.js for RRULE string generation and parsing.
 * Converts between stored JSON format and UI state.
 * Handles UTC/timezone conversions.
 */

// Use namespace import and access via .default for ESM/CJS interop
import * as rruleModule from 'rrule'

// Handle both ESM and CJS module formats
const rrule = (rruleModule as { default?: typeof rruleModule }).default || rruleModule
const { RRule, rrulestr, Frequency, Weekday } = rrule
type Options = rruleModule.Options
type FrequencyType = (typeof rruleModule.Frequency)[keyof typeof rruleModule.Frequency]

import type {
  ScheduleData,
  ScheduleUIState,
  RecurrenceType,
  EndingType,
} from '@/types/schedule'
import {
  getDefaultUIState,
  normalizeUTCString,
  getBrowserTimezone,
  getAvailableTimezones,
} from '@/types/schedule'

// Re-export for convenience
export { getAvailableTimezones, getBrowserTimezone }

/**
 * Subset of RRule options used by this module.
 * Uses Partial<Pick<...>> to derive from rrule's Options type for type safety,
 * with freq required.
 *
 * Note: `interval` can be undefined for uiStateToData (cleaner RRULE output),
 * but MUST be a number for getHumanReadableSummary (toText() crashes on undefined).
 */
type RRuleOptionsSubset = { freq: FrequencyType } & Partial<
  Pick<Options, 'interval' | 'byweekday' | 'bymonthday' | 'count' | 'until' | 'dtstart'>
>

/**
 * Weekday labels for display
 */
export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/**
 * Full weekday labels for accessibility
 */
export const WEEKDAY_FULL_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

/**
 * Month day ordinal suffixes
 */
export function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/**
 * Week number labels for monthly weekday recurrence
 */
export const WEEK_NUMBER_LABELS = ['1st', '2nd', '3rd', '4th', 'Last'] as const

/**
 * Convert week number label index to rrule value
 * rrule uses 1-4 for 1st-4th, and -1 for last
 */
export function weekLabelIndexToRRule(index: number): number {
  return index === 4 ? -1 : index + 1
}

/**
 * Convert rrule week number value to label index
 */
export function rruleWeekToLabelIndex(value: number): number {
  return value === -1 ? 4 : value - 1
}

/**
 * Convert RecurrenceType to rrule Frequency
 */
export function recurrenceTypeToFrequency(type: RecurrenceType): FrequencyType | null {
  switch (type) {
    case 'daily':
      return Frequency.DAILY
    case 'weekly':
      return Frequency.WEEKLY
    case 'monthly':
      return Frequency.MONTHLY
    case 'none':
    default:
      return null
  }
}

/**
 * Convert rrule Frequency to RecurrenceType
 */
export function frequencyToRecurrenceType(freq: FrequencyType | undefined): RecurrenceType {
  switch (freq) {
    case Frequency.DAILY:
      return 'daily'
    case Frequency.WEEKLY:
      return 'weekly'
    case Frequency.MONTHLY:
      return 'monthly'
    default:
      return 'none'
  }
}

/**
 * Convert local date/time strings to UTC datetime string.
 * @param date - Local date in YYYY-MM-DD format
 * @param time - Local time in HH:MM format
 * @param timezone - IANA timezone identifier
 * @returns UTC datetime string with Z suffix
 */
export function localToUTC(date: string, time: string, timezone: string): string {
  // Parse the date and time components
  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)

  // Create a reference date in UTC using the given date/time values
  // Date.UTC returns milliseconds for that moment as if it were UTC
  const utcGuess = Date.UTC(year, month - 1, day, hours, minutes, 0)

  // Get what local time that UTC moment represents in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  // Format the UTC guess in the target timezone to see the offset
  const parts = formatter.formatToParts(new Date(utcGuess))
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '0'

  const tzYear = parseInt(getPart('year'), 10)
  const tzMonth = parseInt(getPart('month'), 10)
  const tzDay = parseInt(getPart('day'), 10)
  const tzHour = parseInt(getPart('hour'), 10)
  const tzMinute = parseInt(getPart('minute'), 10)

  // Calculate the difference between what we wanted and what the timezone shows
  // This tells us the offset we need to apply
  const wantedMinutes = hours * 60 + minutes
  const gotMinutes = tzHour * 60 + tzMinute

  // Handle day boundary crossing
  let dayDiff = 0
  if (tzYear !== year || tzMonth !== month || tzDay !== day) {
    // Cross day boundary - calculate which way
    const wantedDate = new Date(year, month - 1, day)
    const gotDate = new Date(tzYear, tzMonth - 1, tzDay)
    dayDiff = (gotDate.getTime() - wantedDate.getTime()) / (24 * 60 * 60 * 1000)
  }

  const offsetMinutes = (gotMinutes - wantedMinutes) + (dayDiff * 24 * 60)

  // Apply the offset to get the correct UTC time
  const correctUtc = new Date(utcGuess - offsetMinutes * 60 * 1000)

  return normalizeUTCString(correctUtc.toISOString())
}

/**
 * Convert UTC datetime string to local date/time strings.
 * @param utcString - UTC datetime string with Z suffix
 * @param timezone - IANA timezone identifier
 * @returns Object with date (YYYY-MM-DD) and time (HH:MM) in local timezone
 */
export function utcToLocal(
  utcString: string,
  timezone: string,
): { date: string; time: string } {
  const utcDate = new Date(utcString)

  // Format in the target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const date = formatter.format(utcDate) // YYYY-MM-DD format (en-CA)
  const time = timeFormatter.format(utcDate) // HH:MM format

  return { date, time }
}

/**
 * Get timezone short abbreviation (e.g., "EST", "PST")
 */
export function getTimezoneAbbr(timezone: string, date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    })
    const parts = formatter.formatToParts(date)
    const tzPart = parts.find((p) => p.type === 'timeZoneName')
    return tzPart?.value || timezone
  } catch {
    return timezone
  }
}

/**
 * Format time for display (12-hour format with AM/PM)
 */
export function formatTime12h(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`
}

/**
 * Format date for display (e.g., "Friday, March 15, 2024")
 */
export function formatDateLong(date: string, timezone: string): string {
  const dateObj = new Date(date + 'T12:00:00') // Use noon to avoid date shift issues
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  return formatter.format(dateObj)
}

/**
 * Check if two dates are on the same calendar day in a given timezone
 */
export function isSameDay(utc1: string, utc2: string, timezone: string): boolean {
  const local1 = utcToLocal(utc1, timezone)
  const local2 = utcToLocal(utc2, timezone)
  return local1.date === local2.date
}

/**
 * Convert stored JSON data to UI state for editing
 */
export function dataToUIState(
  data: ScheduleData | null | undefined,
  defaultTimezone?: string,
): ScheduleUIState {
  const timezone = data?.tzid || defaultTimezone || getBrowserTimezone()

  // No data = use defaults
  if (!data?.dtstart) {
    return getDefaultUIState(timezone)
  }

  // Convert UTC times to local
  const { date: startDate, time: startTime } = utcToLocal(data.dtstart, timezone)
  const endTime = data.dtend ? utcToLocal(data.dtend, timezone).time : ''

  // Parse RRULE if present
  let recurrenceType: RecurrenceType = 'none'
  let interval = 1
  let weekdays: number[] = []
  let monthDay = 1
  let weekNumber = 1
  let weekdayOfMonth = 0
  let monthlyMode: 'date' | 'weekday' = 'date'
  let endingType: EndingType = 'never'
  let count = 10
  let untilDate = ''

  if (data.rrule) {
    try {
      const rule = rrulestr(data.rrule)
      const options = rule.origOptions

      // Determine recurrence type
      recurrenceType = frequencyToRecurrenceType(options.freq)

      // Extract interval
      interval = options.interval ?? 1

      // Extract weekdays
      if (options.byweekday) {
        const bwd = Array.isArray(options.byweekday) ? options.byweekday : [options.byweekday]
        weekdays = bwd.map((w) => {
          if (typeof w === 'number') return w
          if (w instanceof Weekday) return w.weekday
          const strMap: Record<string, number> = {
            MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6,
          }
          return strMap[w as string] ?? 0
        })
      }

      // Extract month day
      if (options.bymonthday) {
        const bmd = Array.isArray(options.bymonthday) ? options.bymonthday[0] : options.bymonthday
        monthDay = bmd ?? 1
      }

      // Determine monthly mode
      if (recurrenceType === 'monthly' && options.byweekday && !options.bymonthday) {
        monthlyMode = 'weekday'
        const bwd = Array.isArray(options.byweekday) ? options.byweekday[0] : options.byweekday
        if (bwd instanceof Weekday) {
          weekdayOfMonth = bwd.weekday
          weekNumber = bwd.n ?? 1
        } else if (typeof bwd === 'number') {
          weekdayOfMonth = bwd
        }
      }

      // Extract ending conditions
      if (options.count) {
        endingType = 'count'
        count = options.count
      } else if (options.until) {
        endingType = 'until'
        // Convert until date to local format
        const localUntil = utcToLocal(options.until.toISOString(), timezone)
        untilDate = localUntil.date
      }
    } catch {
      // Parse error = treat as one-off
      recurrenceType = 'none'
    }
  }

  return {
    startDate,
    startTime,
    endTime,
    timezone,
    recurrenceType,
    interval,
    weekdays,
    monthDay,
    weekNumber,
    weekdayOfMonth,
    monthlyMode,
    endingType,
    count,
    untilDate,
  }
}

/**
 * Convert UI state to stored JSON format
 */
export function uiStateToData(state: ScheduleUIState): ScheduleData {
  // Convert local times to UTC
  const dtstart = localToUTC(state.startDate, state.startTime, state.timezone)
  const dtend = state.endTime
    ? localToUTC(state.startDate, state.endTime, state.timezone)
    : null

  // Calculate duration in minutes
  const duration = dtend
    ? Math.round((new Date(dtend).getTime() - new Date(dtstart).getTime()) / 60000)
    : 0

  // Build RRULE if needed
  let rruleStr: string | null = null

  if (state.recurrenceType !== 'none') {
    const freq = recurrenceTypeToFrequency(state.recurrenceType)
    if (freq !== null) {
      const rruleOptions: RRuleOptionsSubset = {
        freq,
        dtstart: new Date(dtstart),
        interval: state.interval > 1 ? state.interval : undefined,
      }

      // Weekly: add weekdays
      if (state.recurrenceType === 'weekly' && state.weekdays.length > 0) {
        rruleOptions.byweekday = state.weekdays
      }

      // Monthly: add either monthday or weekday pattern
      if (state.recurrenceType === 'monthly') {
        if (state.monthlyMode === 'date') {
          rruleOptions.bymonthday = state.monthDay
        } else {
          rruleOptions.byweekday = new Weekday(state.weekdayOfMonth, state.weekNumber)
        }
      }

      // Ending conditions
      if (state.endingType === 'count' && state.count > 0) {
        rruleOptions.count = state.count
      } else if (state.endingType === 'until' && state.untilDate) {
        // Convert until date to UTC (use end of day)
        const untilUTC = localToUTC(state.untilDate, '23:59', state.timezone)
        rruleOptions.until = new Date(untilUTC)
      }

      const rule = new RRule(rruleOptions)
      rruleStr = rule.toString()
    }
  }

  return {
    dtstart,
    dtend,
    tzid: state.timezone,
    rrule: rruleStr,
    duration,
  }
}

/**
 * Generate human-readable summary for display
 */
export function getScheduleSummary(state: ScheduleUIState): string {
  const { startDate, startTime, endTime, timezone, recurrenceType } = state

  // Format the time portion
  const startTime12h = formatTime12h(startTime)
  const endTime12h = endTime ? formatTime12h(endTime) : null
  const tzAbbr = getTimezoneAbbr(timezone)

  // Build time string
  let timeStr: string
  if (endTime12h) {
    timeStr = `${startTime12h} - ${endTime12h} ${tzAbbr}`
  } else {
    timeStr = `${startTime12h} ${tzAbbr}`
  }

  // One-off event: "Friday, March 15, 2024 at 9:00 AM EST" or "Friday, March 15, 2024, 9:00 AM - 11:30 AM EST"
  if (recurrenceType === 'none') {
    const dateLong = formatDateLong(startDate, timezone)
    if (endTime12h) {
      return `${dateLong}, ${timeStr}`
    } else {
      return `${dateLong} at ${timeStr}`
    }
  }

  // Recurring event: use RRule.toText() for recurrence description
  const freq = recurrenceTypeToFrequency(recurrenceType)
  if (freq === null) {
    return `${formatDateLong(startDate, timezone)} at ${timeStr}`
  }

  // Build rrule options for toText()
  const rruleOptions: RRuleOptionsSubset = {
    freq,
    interval: state.interval > 1 ? state.interval : 1,
  }

  // Weekly: add weekdays
  if (recurrenceType === 'weekly' && state.weekdays.length > 0) {
    rruleOptions.byweekday = state.weekdays
  }

  // Monthly patterns
  if (recurrenceType === 'monthly') {
    if (state.monthlyMode === 'date') {
      rruleOptions.bymonthday = state.monthDay
    } else {
      rruleOptions.byweekday = new Weekday(state.weekdayOfMonth, state.weekNumber)
    }
  }

  // Ending conditions
  if (state.endingType === 'count' && state.count > 0) {
    rruleOptions.count = state.count
  } else if (state.endingType === 'until' && state.untilDate) {
    rruleOptions.until = new Date(state.untilDate + 'T23:59:59')
  }

  try {
    const rule = new RRule(rruleOptions)
    let recurrenceSummary = rule.toText()

    // Capitalize first letter
    recurrenceSummary = recurrenceSummary.charAt(0).toUpperCase() + recurrenceSummary.slice(1)

    // Append time: "Every week on Mon, Wed, Fri, 9:00 AM - 11:30 AM EST"
    if (endTime12h) {
      return `${recurrenceSummary}, ${timeStr}`
    } else {
      return `${recurrenceSummary} at ${timeStr}`
    }
  } catch {
    return 'Invalid schedule'
  }
}

/**
 * Validate that a schedule configuration is valid
 */
export function validateSchedule(state: ScheduleUIState): string | null {
  // Start date is required
  if (!state.startDate) {
    return 'Start date is required'
  }

  // Start time is required
  if (!state.startTime) {
    return 'Start time is required'
  }

  // Timezone is required and must be valid
  if (!state.timezone) {
    return 'Timezone is required'
  }

  const validTimezones = getAvailableTimezones()
  if (!validTimezones.includes(state.timezone)) {
    return 'Invalid timezone'
  }

  // If end time is provided, validate it
  if (state.endTime) {
    // End time must be after start time (same day only)
    const [startHours, startMins] = state.startTime.split(':').map(Number)
    const [endHours, endMins] = state.endTime.split(':').map(Number)

    const startMinutes = startHours * 60 + startMins
    const endMinutes = endHours * 60 + endMins

    if (endMinutes <= startMinutes) {
      return 'End time must be after start time'
    }
  }

  // Validate recurrence settings
  if (state.recurrenceType !== 'none') {
    // Weekly requires at least one weekday
    if (state.recurrenceType === 'weekly' && state.weekdays.length === 0) {
      return 'Please select at least one day of the week'
    }

    // Monthly by date requires valid day
    if (
      state.recurrenceType === 'monthly' &&
      state.monthlyMode === 'date' &&
      (state.monthDay < 1 || state.monthDay > 31)
    ) {
      return 'Please select a valid day of the month (1-31)'
    }

    // Count must be positive
    if (state.endingType === 'count' && state.count < 1) {
      return 'Number of occurrences must be at least 1'
    }

    // Until date must be provided and in the future
    if (state.endingType === 'until') {
      if (!state.untilDate) {
        return 'End date is required'
      }
      const untilDateObj = new Date(state.untilDate + 'T23:59:59')
      if (untilDateObj < new Date()) {
        return 'End date must be in the future'
      }
    }
  }

  return null
}
