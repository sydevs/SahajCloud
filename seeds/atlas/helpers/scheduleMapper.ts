/**
 * Map an Atlas event `schedule` (parsed from Rails `recurrence_data`) into the
 * project `scheduleFields` group shape. Pure + side-effect free so it's unit
 * testable without a Payload bootstrap.
 *
 * The Atlas shape (see seeds/atlas/extract.ts `parseSchedule`):
 *   { frequency: 'daily'|'weekly'|'monthly', interval, weekNumber, weekday,
 *     startDate (YYYY-MM-DD), startTime (HH:MM), endDate (YYYY-MM-DD|null),
 *     endTime (HH:MM|null) }
 *
 * The target `schedule` group stores native columns: `firstDate` (UTC, with a
 * companion `firstDate_tz`), `recurrenceType`, `interval`, `weekdays`,
 * `monthlyMode` + (`monthDay` | `weekNumber` + `weekdayOfMonth`), `endTime`, and
 * an ending (`endingType` + `untilDate`). The virtual `icalRule` /
 * `upcomingDates` are computed on read and never set here.
 */

import { Temporal } from '@js-temporal/polyfill'

import { SUPPORTED_TIMEZONES } from '@/lib/timezones'
import type { SupportedTimezones } from '@/payload-types'
import type { EventSchedule } from '@/types/schedule'

/** RFC 5545 weekday code, as the CMS enumerates it. */
type WeekdayCode = NonNullable<EventSchedule['weekdays']>[number]
/** Ordinal week within a month, as the CMS enumerates it. */
type WeekNumber = NonNullable<EventSchedule['weekNumber']>

export interface AtlasSchedule {
  frequency: 'daily' | 'weekly' | 'monthly'
  interval: number | null
  weekNumber: number | null
  weekday: string | null
  startDate: string | null
  startTime: string | null
  endDate: string | null
  endTime: string | null
}

/**
 * The subset of the `scheduleFields` group an import populates.
 *
 * Every member derives from the generated `EventSchedule` rather than
 * restating it (#671): this file used to declare `firstDate_tz`, `weekdays`,
 * `weekNumber` and `weekdayOfMonth` as bare `string`s, which type-checked for
 * values the CMS then rejected at write.
 *
 * The optionality is the importer's own, not the column's — a field absent here
 * is one the import never sets.
 */
export interface ScheduleInput {
  firstDate: EventSchedule['firstDate']
  firstDate_tz: SupportedTimezones
  recurrenceType: NonNullable<EventSchedule['recurrenceType']>
  interval: NonNullable<EventSchedule['interval']>
  weekdays?: WeekdayCode[]
  monthlyMode?: NonNullable<EventSchedule['monthlyMode']>
  monthDay?: NonNullable<EventSchedule['monthDay']>
  weekNumber?: WeekNumber
  weekdayOfMonth?: WeekdayCode
  endTime?: NonNullable<EventSchedule['endTime']>
  /** The importer only ever writes an `until` ending, never a `count`. */
  endingType?: 'until'
  untilDate?: NonNullable<EventSchedule['untilDate']>
}

const FREQUENCY_TO_RECURRENCE: Record<AtlasSchedule['frequency'], ScheduleInput['recurrenceType']> =
  {
    daily: 'DAILY',
    weekly: 'WEEKLY',
    monthly: 'MONTHLY',
  }

/** Full lowercase weekday name → RFC 5545 two-letter code. */
const WEEKDAY_CODES: Record<string, WeekdayCode> = {
  monday: 'MO',
  tuesday: 'TU',
  wednesday: 'WE',
  thursday: 'TH',
  friday: 'FR',
  saturday: 'SA',
  sunday: 'SU',
}

const WEEK_NUMBERS = ['1', '2', '3', '4', '-1'] as const satisfies readonly WeekNumber[]
const DEFAULT_TIME = '00:00'

function isWeekNumber(value: string): value is WeekNumber {
  return (WEEK_NUMBERS as readonly string[]).includes(value)
}

/**
 * The zones the `firstDate_tz` column accepts, as a lookup.
 *
 * Built from the same `SUPPORTED_TIMEZONES` the Payload config installs, which
 * is what `SupportedTimezones` in `payload-types.ts` is generated from — so this
 * membership test and that type cannot disagree.
 */
const TIMEZONE_VALUES = new Set<string>(SUPPORTED_TIMEZONES.map(({ value }) => value))

/**
 * Narrow a timezone off the Atlas dump to one the column accepts.
 *
 * Falls back to `UTC` — as the caller already did for a missing zone — rather
 * than passing an unrecognised string through to a write the CMS refuses. The
 * set is the full tz database plus its aliases and the `Etc/GMT*` range, so a
 * zone `Temporal` accepts is essentially always in it; the gap is a fixed-offset
 * zone (`+05:30`) or an alias the pinned `@vvo/tzdb` does not group.
 *
 * ⚠ **`mapSchedule` resolves this ONCE and uses the result for both
 * `firstDate` and `firstDate_tz`.** Narrowing only the column would compute the
 * instant in the source zone and label it `UTC`, putting the event and its whole
 * recurrence hours out — trading a write the CMS rejects for data that is
 * silently wrong, which is the opposite of the point.
 *
 * ⚠ **The substitution is not silent.** It changes the instant an event is read
 * back at, so the caller compares the raw zone against the resolved one and
 * warns — see `reportTimezoneSubstitution` in `import.ts`.
 */
export function supportedTimezone(timeZone: string | null | undefined): SupportedTimezones {
  const candidate = timeZone?.trim()
  return candidate && TIMEZONE_VALUES.has(candidate) ? (candidate as SupportedTimezones) : 'UTC'
}

/** RFC 5545 weekday codes indexed by Temporal `dayOfWeek` (1 = Monday … 7 = Sunday). */
const WEEKDAY_BY_INDEX: readonly WeekdayCode[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

/** Map an Atlas weekday name (case-insensitive) to its two-letter code. */
function weekdayCode(weekday: string | null | undefined): WeekdayCode | undefined {
  if (!weekday) return undefined
  return WEEKDAY_CODES[weekday.trim().toLowerCase()]
}

/** The weekday of a `YYYY-MM-DD` date — the fallback for weekly events with no `weekday`. */
function weekdayFromDate(startDate: string | null | undefined): WeekdayCode | undefined {
  if (!startDate) return undefined
  try {
    return WEEKDAY_BY_INDEX[Temporal.PlainDate.from(startDate).dayOfWeek - 1]
  } catch {
    return undefined
  }
}

/**
 * Combine an Atlas local `startDate` + `startTime` in the event's timezone into
 * a UTC instant for the `firstDate` column. Returns null when the date is
 * missing or unparseable (the caller then skips the schedule).
 */
function toFirstDateUtc(
  startDate: string,
  startTime: string | null,
  timeZone: string,
): string | null {
  const time = startTime?.trim() || DEFAULT_TIME
  try {
    const zoned = Temporal.ZonedDateTime.from(`${startDate}T${time}:00[${timeZone}]`)
    return new Date(zoned.toInstant().epochMilliseconds).toISOString()
  } catch {
    return null
  }
}

/**
 * Map an Atlas schedule to the `scheduleFields` group, or null when there's no
 * schedule (inactive events) or it lacks a usable start date.
 */
export function mapSchedule(
  schedule: AtlasSchedule | null | undefined,
  timeZone: string | null | undefined,
): ScheduleInput | null {
  if (!schedule || !schedule.startDate) return null

  const recurrenceType = FREQUENCY_TO_RECURRENCE[schedule.frequency]
  if (!recurrenceType) return null

  // Resolved once: `firstDate` is an instant computed *in* this zone and
  // `firstDate_tz` is the zone it is read back in. They must be the same string.
  const resolvedTimeZone = supportedTimezone(timeZone)

  const firstDate = toFirstDateUtc(schedule.startDate, schedule.startTime, resolvedTimeZone)
  if (!firstDate) return null

  const result: ScheduleInput = {
    firstDate,
    firstDate_tz: resolvedTimeZone,
    recurrenceType,
    interval: schedule.interval && schedule.interval > 0 ? schedule.interval : 1,
  }

  if (recurrenceType === 'WEEKLY') {
    // `parseSchedule` now derives a missing weekday from the start date, so
    // events.json always carries one. Kept as a safety net: `weekdays` is
    // required for weekly recurrence, and a hand-edited row could omit it.
    const code = weekdayCode(schedule.weekday) ?? weekdayFromDate(schedule.startDate)
    if (code) result.weekdays = [code]
  }

  if (recurrenceType === 'MONTHLY') {
    // No fallback here on purpose: "first <weekday>" and "day N of the month"
    // are different recurrences, so guessing would silently reschedule the
    // event. `parseSchedule` supplies the weekday for Atlas's `monthly_1st`.
    const code = weekdayCode(schedule.weekday)
    if (code) {
      // "1st Saturday" style — by weekday.
      result.monthlyMode = 'weekday'
      const week = String(schedule.weekNumber ?? 1)
      result.weekNumber = isWeekNumber(week) ? week : '1'
      result.weekdayOfMonth = code
    } else {
      // By date — day-of-month taken from the start date.
      result.monthlyMode = 'date'
      const day = Number(schedule.startDate.slice(8, 10))
      result.monthDay = day >= 1 && day <= 31 ? day : 1
    }
  }

  if (schedule.endTime?.trim()) result.endTime = schedule.endTime.trim()

  // A legacy end date becomes an "until" ending on the recurrence.
  if (schedule.endDate) {
    result.endingType = 'until'
    result.untilDate = schedule.endDate
  }

  return result
}
