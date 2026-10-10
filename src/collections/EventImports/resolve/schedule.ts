/**
 * Reading a weekday and a start time back off a schedule, for comparison.
 *
 * The duplicate check compares a row the import just built against an event the
 * CMS already holds, and the two arrive in the same stored shape — so both
 * answers are derived here rather than once per side.
 */

import { Temporal } from '@js-temporal/polyfill'

import { getLocalTimeHHMM, lastOccurrenceEnd } from '@/lib/schedule/scheduleHooks'
import { minutesOfDay } from '@/lib/schedule/time'
import {
  WEEK_NUMBERS,
  WEEKDAY_BY_INDEX,
  weekdayCodeFor,
  weekdayIndexOf,
} from '@/lib/schedule/weekdays'
import type { EventSchedule } from '@/types/schedule'

/**
 * The schedule fields a comparison reads.
 *
 * Derived from the stored group, so a row the import built and a row the CMS
 * holds both satisfy it, and a change to either column's vocabulary is a
 * compile error here rather than a comparison that silently stops matching.
 */
export type ComparableSchedule = Pick<EventSchedule, 'firstDate' | 'firstDate_tz'> &
  Partial<
    Pick<
      EventSchedule,
      | 'endingType'
      | 'count'
      | 'interval'
      | 'monthDay'
      | 'monthlyMode'
      | 'recurrenceType'
      | 'untilDate'
      | 'weekNumber'
      | 'weekdays'
      | 'weekdayOfMonth'
    >
  >

export type WeekdayCode = NonNullable<EventSchedule['weekdays']>[number]

/**
 * The weekdays a schedule's occurrences land on.
 *
 * ⚠ **`firstDate` is only the answer for a schedule that names no weekday.** A
 * weekly class stores its days in `weekdays` and a monthly one in
 * `weekdayOfMonth`, and `firstDate` merely has to be one of them — so reading
 * the instant for a weekly class would compare one of its days against all of
 * another's.
 */
export function occurrenceWeekdays(schedule: ComparableSchedule): readonly WeekdayCode[] {
  // Every day, so it overlaps whatever it is compared against. The import
  // writes no `DAILY` schedule — a daily class is seven weekdays — but an event
  // already in the CMS may hold one.
  if (schedule.recurrenceType === 'DAILY') return WEEKDAY_BY_INDEX
  if (schedule.weekdays?.length) return schedule.weekdays
  if (schedule.weekdayOfMonth) return [schedule.weekdayOfMonth]

  let dayOfWeek: number
  try {
    dayOfWeek = Temporal.Instant.from(schedule.firstDate).toZonedDateTimeISO(
      schedule.firstDate_tz,
    ).dayOfWeek
  } catch {
    // A stored instant or zone this cannot read would otherwise throw in the
    // middle of a chunk and lose the rows after it. A schedule yielding no
    // weekday simply shares none.
    return []
  }
  return [weekdayCodeFor(dayOfWeek)]
}

/**
 * The start time as `HH:MM` on the class's own clock, or null.
 *
 * ⚠ **Read in `firstDate_tz`, never in UTC.** `firstDate` is an instant, so two
 * 18:00 classes an hour of offset apart hold different ones — comparing the
 * instants would call them 60 minutes apart, and two genuinely different
 * classes in one city the same.
 *
 * The pairing is the whole point of the wrapper: `getLocalTimeHHMM` takes an
 * instant and a zone as two arguments, and handing it a schedule's instant with
 * anybody else's zone is the error above.
 */
export function wallStartTime(schedule: ComparableSchedule): string | null {
  return getLocalTimeHHMM(schedule.firstDate, schedule.firstDate_tz)
}

/**
 * One class's schedule reduced to what a comparison needs.
 *
 * ⚠ **Derived once per class, never per comparison.** The duplicate check runs
 * the cross product of a 500-row batch against every event in the subtree —
 * upwards of 600k pairs — and a `Temporal.ZonedDateTime` costs about 5µs to
 * build. Reading either answer inside the loop put 5 to 20 seconds of blocking
 * CPU on the event loop, in an endpoint, for a result that cannot change
 * between comparisons.
 */
export interface ScheduleKey {
  /**
   * The occurrence weekdays as a 7-bit mask, Monday the low bit.
   *
   * A mask rather than a list so an overlap is one `&`. Zero means the schedule
   * yielded no weekday — an unreadable one — and so overlaps nothing, which is
   * the answer an empty list gave.
   */
  weekdayMask: number
  /** Minutes since midnight on the class's own clock, or null. */
  startMinutes: number | null
  /**
   * The first occurrence's local day, in days since 1970-01-01.
   *
   * ⚠ **Optional because rows resolved before it existed lack it**, and a
   * missing bound reads as unbounded — the old, wider answer — rather than as
   * "never overlaps".
   */
  firstDay?: number
  /** The last occurrence's local day, or null for a series with no end. */
  lastDay?: number | null
  /**
   * A monthly-by-weekday class's week numbers as a 5-bit mask (`1`–`4`, then
   * `-1`), or 0 for anything else. The first and third Tuesday are two classes.
   */
  monthWeeks?: number
  /** A monthly-by-date class's day of the month, or null for anything else. */
  monthDay?: number | null
}

export function scheduleKey(schedule: ComparableSchedule): ScheduleKey {
  let weekdayMask = 0
  for (const code of occurrenceWeekdays(schedule)) {
    weekdayMask |= 1 << (weekdayIndexOf(code) - 1)
  }
  const monthly = schedule.recurrenceType === 'MONTHLY'
  const byWeekday = monthly && schedule.monthlyMode !== 'date' && !!schedule.weekNumber
  const byDate = monthly && schedule.monthlyMode === 'date' && schedule.monthDay != null
  return {
    // A monthly-by-date class lands on every weekday over a year, so it shares
    // whichever one the other class names.
    weekdayMask: byDate ? 0b1111111 : weekdayMask,
    startMinutes: minutesOfDay(wallStartTime(schedule)),
    firstDay: localDayOf(schedule.firstDate, schedule.firstDate_tz) ?? undefined,
    lastDay: lastDayOf(schedule),
    monthWeeks: byWeekday ? 1 << WEEK_NUMBERS.indexOf(schedule.weekNumber!) : 0,
    monthDay: byDate ? schedule.monthDay! : null,
  }
}

/**
 * Whether two classes can ever meet on the same day.
 *
 * ⚠ **Every clause narrows, none widens.** A one-off in November and one in
 * December at the same hall share a weekday and nothing else; a series that
 * ended before the other began shares no day at all; the first and the third
 * Tuesday of the month are two classes. Each was reported as a duplicate when
 * the weekday was the whole test.
 */
export function schedulesOverlap(a: ScheduleKey, b: ScheduleKey): boolean {
  if ((a.weekdayMask & b.weekdayMask) === 0) return false

  const aFirst = a.firstDay ?? -Infinity
  const bFirst = b.firstDay ?? -Infinity
  const aLast = a.lastDay ?? Infinity
  const bLast = b.lastDay ?? Infinity
  if (aFirst > bLast || bFirst > aLast) return false

  if (a.monthWeeks && b.monthWeeks && !weeksMayMeet(a.monthWeeks, b.monthWeeks)) return false
  if (a.monthDay != null && b.monthDay != null && a.monthDay !== b.monthDay) return false
  return true
}

/** `-1` (last) is also the fourth week in a four-week month, so the two may meet. */
function weeksMayMeet(a: number, b: number): boolean {
  if (a & b) return true
  const fourth = 1 << WEEK_NUMBERS.indexOf('4')
  const last = 1 << WEEK_NUMBERS.indexOf('-1')
  return ((a & fourth) !== 0 && (b & last) !== 0) || ((a & last) !== 0 && (b & fourth) !== 0)
}

function localDayOf(instant: string, timezone: string): null | number {
  try {
    const { day, month, year } = Temporal.Instant.from(instant).toZonedDateTimeISO(timezone)
    return Date.UTC(year, month - 1, day) / 86_400_000
  } catch {
    return null
  }
}

/** The last occurrence's local day, or null when the series has no end or cannot be read. */
function lastDayOf(schedule: ComparableSchedule): null | number {
  // A one-off has no recurrence and so ends the day it starts.
  if (!schedule.recurrenceType) return localDayOf(schedule.firstDate, schedule.firstDate_tz)
  let end: null | string
  try {
    end = lastOccurrenceEnd(schedule as Partial<EventSchedule>)
  } catch {
    return null
  }
  return end ? localDayOf(end, schedule.firstDate_tz) : null
}
