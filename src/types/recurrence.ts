/**
 * Recurrence Field Types
 *
 * Type definitions for the recurrence field that generates iCalendar RRULE strings.
 * Uses rrule.js for RRULE generation and parsing.
 *
 * @see https://icalendar.org/iCalendar-RFC-5545/3-8-5-3-recurrence-rule.html
 */

// Re-export rrule types for convenience
export { Frequency, type Options, type ByWeekday } from 'rrule'
export { Weekday, type WeekdayStr, ALL_WEEKDAYS } from 'rrule'

/**
 * Stored JSON structure in database.
 * Per RFC 5545, RRULE and duration are separate concepts:
 * - RRULE defines WHEN recurrences START
 * - Duration applies to all occurrences
 *
 * One-off events have rrule: null (per RFC 5545, RRULE is optional)
 */
export interface RecurrenceData {
  /** The RRULE string, or null for one-off events */
  rrule: string | null
  /** Event duration in days (1 = single day) */
  duration: number
}

/**
 * Complexity levels for the recurrence field UI.
 * Limits available options based on use case complexity.
 *
 * - 'simple': One-off, daily, weekly on specific days
 * - 'standard': + bi-weekly, monthly on date
 * - 'advanced': + monthly on weekday, custom intervals, multi-day spans
 */
export type RecurrenceComplexity = 'simple' | 'standard' | 'advanced'

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
 * UI state for editing recurrence patterns.
 * Extends partial rrule Options with UI-specific fields.
 */
export interface RecurrenceUIState {
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
  /** End date if ending by date */
  until: Date | null
  /** Multi-day span in days (1 = single day) */
  duration: number
}

/**
 * Field factory options
 */
export interface RecurrenceFieldOptions {
  /** Field name (default: 'recurrence') */
  name?: string
  /** Field label (default: 'Recurrence') */
  label?: string
  /** Whether the field is required */
  required?: boolean
  /** Complexity level (default: 'standard') */
  complexity?: RecurrenceComplexity
  /** Default duration in days (default: 1) */
  defaultDuration?: number
  /** Admin configuration */
  admin?: {
    /** Help text description */
    description?: string
    /** Position in admin UI */
    position?: 'sidebar'
    /** Conditional display function */
    condition?: (...args: unknown[]) => boolean
  }
}

/**
 * Helper to check if event is one-off (no recurrence)
 */
export function isOneOff(data: RecurrenceData | null | undefined): boolean {
  return !data?.rrule
}

/**
 * Default UI state for new recurrence fields
 */
export function getDefaultUIState(defaultDuration: number = 1): RecurrenceUIState {
  return {
    recurrenceType: 'none',
    interval: 1,
    weekdays: [],
    monthDay: 1,
    weekNumber: 1,
    weekdayOfMonth: 0,
    monthlyMode: 'date',
    endingType: 'never',
    count: 10,
    until: null,
    duration: defaultDuration,
  }
}
