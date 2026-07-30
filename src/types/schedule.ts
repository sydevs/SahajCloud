import type { Event } from '@/payload-types'

/**
 * A single exclusion date range within the exclusions array.
 * When endDate is omitted, only startDate is excluded (single-date exclusion).
 *
 * Optional fields are `| null` to match how Payload stores them, so a schedule
 * read off a document assigns without a cast.
 */
export interface ExclusionRange {
  startDate: string // YYYY-MM-DD or ISO datetime
  endDate?: string | null // YYYY-MM-DD or ISO datetime, optional
  reason?: string | null
  id?: string | null // PayloadCMS array item ID
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
  /**
   * Derived, not an input: the stored `lastDate` column, recomputed from the
   * fields above on every write by `computeLastDate`. Present here so hooks
   * merging a previous schedule doc over an incoming patch stay type-honest.
   */
  lastDate?: string | null
}

/**
 * A schedule as either the hand-written `ScheduleSubFields` or the
 * Payload-generated shape, whose optional fields are `| null` rather than
 * `| undefined`.
 *
 * The two are structurally interchangeable for `buildRRuleTemporal`: every
 * field it reads is guarded by a truthy check or `??`, both of which treat
 * `null` and `undefined` identically. Accepting both here beats widening the
 * shared `ScheduleSubFields` (which would ripple into `audiences/scheduleMatch`)
 * or forcing callers to normalize.
 */
export type EventScheduleInput = NonNullable<Event['schedule']> | Partial<ScheduleSubFields>
