/**
 * Reading a weekday and a start time back off a schedule, for comparison.
 *
 * The duplicate check compares a row the import just built against an event the
 * CMS already holds, and the two arrive in the same stored shape — so both
 * answers are derived here rather than once per side.
 */

import { Temporal } from '@js-temporal/polyfill'

import { WEEKDAY_BY_INDEX, weekdayCodeFor } from '@/lib/schedule/weekdays'
import type { Event } from '@/payload-types'

type StoredSchedule = NonNullable<Event['schedule']>

/**
 * The schedule fields a comparison reads.
 *
 * Derived from the stored group, so a row the import built and a row the CMS
 * holds both satisfy it, and a change to either column's vocabulary is a
 * compile error here rather than a comparison that silently stops matching.
 */
export type ComparableSchedule = Pick<StoredSchedule, 'firstDate' | 'firstDate_tz'> &
  Partial<Pick<StoredSchedule, 'recurrenceType' | 'weekdays' | 'weekdayOfMonth'>>

/** `firstDate` as a wall clock in the zone the schedule names, or null. */
function zoned(schedule: ComparableSchedule): Temporal.ZonedDateTime | null {
  try {
    return Temporal.Instant.from(schedule.firstDate).toZonedDateTimeISO(schedule.firstDate_tz)
  } catch {
    // A stored instant or zone this cannot read would otherwise throw in the
    // middle of a chunk and lose the rows after it. The pair that cannot be
    // read simply does not match.
    return null
  }
}

/**
 * The weekdays a schedule's occurrences land on.
 *
 * ⚠ **`firstDate` is only the answer for a schedule that names no weekday.** A
 * weekly class stores its days in `weekdays` and a monthly one in
 * `weekdayOfMonth`, and `firstDate` merely has to be one of them — so reading
 * the instant for a weekly class would compare one of its days against all of
 * another's.
 */
export function occurrenceWeekdays(
  schedule: ComparableSchedule,
): readonly NonNullable<StoredSchedule['weekdays']>[number][] {
  // Every day, so it overlaps whatever it is compared against. The import
  // writes no `DAILY` schedule — a daily class is seven weekdays — but an event
  // already in the CMS may hold one.
  if (schedule.recurrenceType === 'DAILY') return WEEKDAY_BY_INDEX
  if (schedule.weekdays?.length) return schedule.weekdays
  if (schedule.weekdayOfMonth) return [schedule.weekdayOfMonth]

  const start = zoned(schedule)
  return start ? [weekdayCodeFor(start.dayOfWeek)] : []
}

/**
 * The start time as `HH:MM` on the class's own clock, or null.
 *
 * ⚠ **Read in `firstDate_tz`, never in UTC.** `firstDate` is an instant, so two
 * 18:00 classes an hour of offset apart hold different ones — comparing the
 * instants would call them 60 minutes apart, and two genuinely different
 * classes in one city the same.
 */
export function wallStartTime(schedule: ComparableSchedule): string | null {
  const start = zoned(schedule)
  return start ? start.toPlainTime().toString({ smallestUnit: 'minute' }) : null
}
