/**
 * Event Timing Field Types
 *
 * Type definitions for the event timing field that generates iCalendar RRULE strings
 * with start/end datetime and timezone support.
 * Uses rrule.js for RRULE generation and parsing.
 *
 * @see https://icalendar.org/iCalendar-RFC-5545/3-8-5-3-recurrence-rule.html
 */

import type { JSONField } from 'payload'

// Note: rrule types should be imported directly from 'rrule' in consuming files
// due to ESM/CJS interop issues with re-exports

/**
 * UTC datetime string format regex.
 * Matches: "2024-03-15T14:00:00Z"
 */
export const UTC_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/

/**
 * Stored JSON structure in database.
 * Per RFC 5545:
 * - DTSTART defines when events start (stored as UTC with Z suffix)
 * - DTEND defines when events end (optional, null = open-ended)
 * - TZID stores the timezone for UI conversion and DST-aware recurrence
 * - RRULE defines recurrence pattern (with embedded DTSTART)
 * - Duration is computed from dtend - dtstart in minutes
 */
export interface EventTimingData {
  /** Start date-time in UTC with Z suffix (e.g., "2024-03-15T14:00:00Z") */
  dtstart: string
  /** End date-time in UTC or null for open-ended (e.g., "2024-03-15T16:30:00Z") */
  dtend: string | null
  /** IANA timezone identifier for display/input (e.g., "America/New_York") */
  tzid: string
  /** Recurrence pattern with DTSTART or null for one-off */
  rrule: string | null
  /** Duration in minutes (computed from dtend - dtstart, or 0 if open-ended) */
  duration: number
}

/**
 * Complexity levels for the event timing field UI.
 * Limits available options based on use case complexity.
 *
 * - 'simple': Start date/time, timezone, basic recurrence (no end time)
 * - 'standard': + optional end time, bi-weekly, monthly on date
 * - 'advanced': + monthly on weekday, custom intervals
 */
export type EventTimingComplexity = 'simple' | 'standard' | 'advanced'

/**
 * Helper type for ending condition UI
 */
export type EndingType = 'never' | 'count' | 'until'

/**
 * Recurrence type for UI selection.
 * Maps to Frequency enum with additional 'none' for one-off events.
 */
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly'

/**
 * UI state for editing event timing patterns.
 * Combines datetime/timezone fields with recurrence settings.
 */
export interface EventTimingUIState {
  // === Date/Time Fields ===
  /** Start date in local timezone (YYYY-MM-DD) */
  startDate: string
  /** Start time in local timezone (HH:MM) */
  startTime: string
  /** End time in local timezone (HH:MM) or empty for open-ended */
  endTime: string
  /** IANA timezone identifier */
  timezone: string

  // === Recurrence Fields ===
  /** Recurrence type for UI selection */
  recurrenceType: RecurrenceType
  /** Every N days/weeks/months (default: 1) */
  interval: number
  /** Selected weekdays for weekly recurrence (0=Monday to 6=Sunday) */
  weekdays: number[]
  /** Day of month for monthly by date (1-31) */
  monthDay: number
  /** Week number for monthly by weekday (1-5, -1 for last) */
  weekNumber: number
  /** Weekday for monthly by weekday (0=Monday to 6=Sunday) */
  weekdayOfMonth: number
  /** UI toggle for monthly recurrence type */
  monthlyMode: 'date' | 'weekday'
  /** How the recurrence ends */
  endingType: EndingType
  /** Number of occurrences if ending by count */
  count: number
  /** End date for recurrence if ending by date (YYYY-MM-DD in local timezone) */
  untilDate: string
}

/**
 * Field factory options
 */
export interface EventTimingFieldOptions {
  /** Field name (default: 'eventTiming') */
  name?: string
  /** Field label (default: 'Event Timing') */
  label?: string
  /** Whether the field is required */
  required?: boolean
  /** Complexity level (default: 'standard') */
  complexity?: EventTimingComplexity
  /** Default timezone (falls back to browser timezone if not specified) */
  defaultTimezone?: string
  /** Admin configuration (uses PayloadCMS JSONField admin type) */
  admin?: Partial<JSONField['admin']>
}

/**
 * Helper to check if event is one-off (no recurrence)
 */
export function isOneOff(data: EventTimingData | null | undefined): boolean {
  return !data?.rrule
}

/**
 * Normalize UTC datetime string to standard format.
 * - Strips milliseconds: "2024-03-15T14:00:00.000Z" → "2024-03-15T14:00:00Z"
 * - Converts +00:00 suffix to Z: "2024-03-15T14:00:00+00:00" → "2024-03-15T14:00:00Z"
 */
export function normalizeUTCString(datetime: string): string {
  const date = new Date(datetime)
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid datetime string: ${datetime}`)
  }
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * Validate UTC datetime string format.
 */
export function isValidUTCString(datetime: string): boolean {
  return UTC_DATETIME_REGEX.test(datetime)
}

/**
 * Get browser's timezone as IANA identifier.
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

/**
 * Get all available IANA timezone identifiers.
 */
export function getAvailableTimezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    // Fallback for older browsers
    return ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Tokyo']
  }
}

/**
 * Default UI state for new event timing fields
 */
export function getDefaultUIState(defaultTimezone?: string): EventTimingUIState {
  const now = new Date()
  const timezone = defaultTimezone || getBrowserTimezone()

  // Format current date in YYYY-MM-DD
  const startDate = now.toISOString().split('T')[0]

  // Round to next hour for cleaner default
  const nextHour = new Date(now)
  nextHour.setMinutes(0, 0, 0)
  nextHour.setHours(nextHour.getHours() + 1)
  const startTime = `${String(nextHour.getHours()).padStart(2, '0')}:00`

  return {
    // Date/Time fields
    startDate,
    startTime,
    endTime: '', // Empty = open-ended
    timezone,

    // Recurrence fields
    recurrenceType: 'none',
    interval: 1,
    weekdays: [],
    monthDay: 1,
    weekNumber: 1,
    weekdayOfMonth: 0,
    monthlyMode: 'date',
    endingType: 'never',
    count: 10,
    untilDate: '',
  }
}
