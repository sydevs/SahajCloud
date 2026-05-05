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
 * Sub-field structure matching the PayloadCMS Group field sub-fields for a schedule.
 * Values use RFC 5545 conventions: uppercase frequencies, two-letter day codes.
 * Extracted to src/types/ because it is shared between scheduleHooks.ts and
 * audiences/scheduleMatch.ts.
 */
export interface ScheduleSubFields {
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
