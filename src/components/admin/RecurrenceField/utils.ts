/**
 * Utility functions for recurrence field RRULE generation and parsing
 *
 * Uses rrule.js for RRULE string generation and parsing.
 * Converts between stored JSON format and UI state.
 */

import { RRule, rrulestr, Frequency, Weekday } from 'rrule'

import type {
  RecurrenceData,
  RecurrenceUIState,
  RecurrenceType,
  EndingType,
} from '@/types/recurrence'
import { getDefaultUIState } from '@/types/recurrence'

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
export function recurrenceTypeToFrequency(type: RecurrenceType): Frequency | null {
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
export function frequencyToRecurrenceType(freq: Frequency | undefined): RecurrenceType {
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
 * Convert stored JSON data to UI state for editing
 */
export function dataToUIState(
  data: RecurrenceData | null | undefined,
  defaultDuration: number = 1,
): RecurrenceUIState {
  const duration = data?.duration ?? defaultDuration

  // null rrule = one-off event (per RFC 5545)
  if (!data?.rrule) {
    return {
      ...getDefaultUIState(defaultDuration),
      duration,
    }
  }

  try {
    const rule = rrulestr(data.rrule)
    const options = rule.origOptions

    // Determine recurrence type
    const recurrenceType = frequencyToRecurrenceType(options.freq)

    // Extract weekdays (rrule uses 0=Monday convention, same as us)
    let weekdays: number[] = []
    if (options.byweekday) {
      const bwd = Array.isArray(options.byweekday) ? options.byweekday : [options.byweekday]
      weekdays = bwd.map((w) => {
        if (typeof w === 'number') return w
        if (w instanceof Weekday) return w.weekday
        // WeekdayStr case - convert 'MO', 'TU', etc. to 0-6
        const strMap: Record<string, number> = {
          MO: 0,
          TU: 1,
          WE: 2,
          TH: 3,
          FR: 4,
          SA: 5,
          SU: 6,
        }
        return strMap[w as string] ?? 0
      })
    }

    // Extract month day
    let monthDay = 1
    if (options.bymonthday) {
      const bmd = Array.isArray(options.bymonthday) ? options.bymonthday[0] : options.bymonthday
      monthDay = bmd ?? 1
    }

    // Determine monthly mode and extract weekday info
    let monthlyMode: 'date' | 'weekday' = 'date'
    let weekNumber = 1
    let weekdayOfMonth = 0

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

    // Extract ending type
    let endingType: EndingType = 'never'
    let count = 10
    let until: Date | null = null

    if (options.count) {
      endingType = 'count'
      count = options.count
    } else if (options.until) {
      endingType = 'until'
      until = options.until
    }

    return {
      recurrenceType,
      interval: options.interval ?? 1,
      weekdays,
      monthDay,
      weekNumber,
      weekdayOfMonth,
      monthlyMode,
      endingType,
      count,
      until,
      duration,
    }
  } catch {
    // Parse error = treat as one-off
    return {
      ...getDefaultUIState(defaultDuration),
      duration,
    }
  }
}

/**
 * Convert UI state to stored JSON format
 */
export function uiStateToData(
  state: RecurrenceUIState,
  defaultDuration: number = 1,
): RecurrenceData {
  const duration = state.duration ?? defaultDuration

  // No recurrence = one-off event (null rrule per RFC 5545)
  if (state.recurrenceType === 'none') {
    return { rrule: null, duration }
  }

  const freq = recurrenceTypeToFrequency(state.recurrenceType)
  if (freq === null) {
    return { rrule: null, duration }
  }

  // Build rrule options
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rruleOptions: any = {
    freq,
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
      // Monthly by weekday (e.g., 2nd Tuesday)
      rruleOptions.byweekday = new Weekday(state.weekdayOfMonth, state.weekNumber)
    }
  }

  // Ending conditions
  if (state.endingType === 'count' && state.count > 0) {
    rruleOptions.count = state.count
  } else if (state.endingType === 'until' && state.until) {
    rruleOptions.until = state.until
  }

  const rule = new RRule(rruleOptions)

  return {
    rrule: rule.toString(),
    duration,
  }
}

/**
 * Generate human-readable summary for display using RRule.toText()
 */
export function getHumanReadableSummary(state: RecurrenceUIState): string {
  if (state.recurrenceType === 'none') {
    return 'Does not repeat'
  }

  const freq = recurrenceTypeToFrequency(state.recurrenceType)
  if (freq === null) {
    return 'Does not repeat'
  }

  // Build rrule options for toText()
  // IMPORTANT: Do NOT pass undefined values - rrule.toText() crashes on undefined interval
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rruleOptions: any = {
    freq,
    interval: state.interval > 1 ? state.interval : 1, // Always pass a number, never undefined
  }

  // Weekly: add weekdays
  if (state.recurrenceType === 'weekly' && state.weekdays.length > 0) {
    rruleOptions.byweekday = state.weekdays
  }

  // Monthly patterns
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
  } else if (state.endingType === 'until' && state.until) {
    rruleOptions.until = state.until
  }

  try {
    const rule = new RRule(rruleOptions)
    let summary = rule.toText()

    // Capitalize first letter
    summary = summary.charAt(0).toUpperCase() + summary.slice(1)

    // Append duration info for multi-day events
    if (state.duration && state.duration > 1) {
      summary += ` (${state.duration}-day event)`
    }

    return summary
  } catch {
    return 'Invalid recurrence pattern'
  }
}

/**
 * Validate that a recurrence configuration is valid
 */
export function validateRecurrence(state: RecurrenceUIState): string | null {
  // One-off events are always valid
  if (state.recurrenceType === 'none') {
    return null
  }

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

  // Until date must be in the future
  if (state.endingType === 'until' && state.until && state.until < new Date()) {
    return 'End date must be in the future'
  }

  // Duration must be positive
  if (state.duration < 1) {
    return 'Duration must be at least 1 day'
  }

  return null
}
