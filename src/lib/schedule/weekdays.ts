/**
 * The RFC 5545 weekday vocabulary, indexed to agree with Temporal.
 *
 * ⚠ **This array's ORDER is the `enum_events_schedule_weekdays` Postgres enum,
 * and two callers read a code back out of it by position**
 * (`WEEKDAY_BY_INDEX.indexOf(code) + 1` is a Temporal `dayOfWeek`). Reorder it
 * and schedules land on the wrong day, with no type error and no refused write
 * — which is why the table has one home rather than a copy per importer.
 */

import type { Event } from '@/payload-types'

type EventSchedule = NonNullable<Event['schedule']>

/** RFC 5545 weekday codes indexed by Temporal `dayOfWeek` (1 = Monday … 7 = Sunday). */
export const WEEKDAY_BY_INDEX: readonly NonNullable<EventSchedule['weekdays']>[number][] = [
  'MO',
  'TU',
  'WE',
  'TH',
  'FR',
  'SA',
  'SU',
]

/** The ordinal weeks the `weekNumber` column accepts; `-1` is the last. */
export const WEEK_NUMBERS = ['1', '2', '3', '4', '-1'] as const satisfies readonly NonNullable<
  EventSchedule['weekNumber']
>[]

const WEEKDAY_CODES = new Set<string>(WEEKDAY_BY_INDEX)

export function isWeekdayCode(
  value: string,
): value is NonNullable<EventSchedule['weekdays']>[number] {
  return WEEKDAY_CODES.has(value)
}

export function isWeekNumber(value: string): value is NonNullable<EventSchedule['weekNumber']> {
  return (WEEK_NUMBERS as readonly string[]).includes(value)
}

/** The code for a Temporal `dayOfWeek` (1-7). */
export function weekdayCodeFor(
  dayOfWeek: number,
): NonNullable<EventSchedule['weekdays']>[number] {
  return WEEKDAY_BY_INDEX[dayOfWeek - 1]!
}

/** The Temporal `dayOfWeek` (1-7) for a code — the inverse of `weekdayCodeFor`. */
export function weekdayIndexOf(code: NonNullable<EventSchedule['weekdays']>[number]): number {
  return WEEKDAY_BY_INDEX.indexOf(code) + 1
}
