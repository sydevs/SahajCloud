/**
 * Map a CSV row's schedule columns onto the `scheduleFields` group.
 *
 * The Atlas seed has a mapper for the same target (`seeds/atlas/helpers/
 * scheduleMapper.ts`) and this is deliberately not it: that one maps a parsed
 * Rails `recurrence_data` and answers a missing field by dropping the schedule,
 * because nobody is waiting on the answer. Here a volunteer is, so every
 * refusal has to name the column that caused it and the row has to survive long
 * enough to be reported.
 */

import { Temporal } from '@js-temporal/polyfill'

import type { SupportedTimezones } from '@/payload-types'
import type { EventSchedule } from '@/types/schedule'

/** RFC 5545 weekday code, as the CMS enumerates it. */
export type WeekdayCode = NonNullable<EventSchedule['weekdays']>[number]
type WeekNumber = NonNullable<EventSchedule['weekNumber']>

/** What the CSV's `scheduleType` column accepts. */
export const SCHEDULE_TYPES = ['one-off', 'weekly', 'monthly', 'inactive'] as const
export type ScheduleType = (typeof SCHEDULE_TYPES)[number]

/**
 * The subset of the schedule group an import writes.
 *
 * Derived from the generated `EventSchedule` rather than restated: hand-written
 * copies of `firstDate_tz`, `weekdays` and `weekNumber` as bare strings
 * type-checked for values the CMS then rejected at write (#671).
 */
export interface ImportSchedule {
  firstDate: EventSchedule['firstDate']
  firstDate_tz: SupportedTimezones
  recurrenceType?: NonNullable<EventSchedule['recurrenceType']>
  interval: NonNullable<EventSchedule['interval']>
  weekdays?: WeekdayCode[]
  monthlyMode?: NonNullable<EventSchedule['monthlyMode']>
  monthDay?: NonNullable<EventSchedule['monthDay']>
  weekNumber?: WeekNumber
  weekdayOfMonth?: WeekdayCode
  endTime?: NonNullable<EventSchedule['endTime']>
  /** The import only ever writes an `until` ending, never a `count`. */
  endingType?: 'until'
  untilDate?: NonNullable<EventSchedule['untilDate']>
}

/** The schedule columns, as the parser hands them over. */
export interface ScheduleColumns {
  scheduleType?: string
  date?: string
  startTime?: string
  endTime?: string
  weekdays?: string
  interval?: string
  monthWeek?: string
  untilDate?: string
}

export interface MapScheduleArgs extends ScheduleColumns {
  /** Already narrowed to a zone the `firstDate_tz` column accepts. */
  timezone: SupportedTimezones
  /**
   * Today, in the event's own zone — the anchor for "the next matching day".
   *
   * Injected because a weekly row with no `date` resolves against it, so a
   * spec asserting which Tuesday it picked cannot be written against the
   * wall clock.
   */
  today: Temporal.PlainDate
}

export type MapScheduleResult =
  /** `inactive` rows carry no schedule at all; the event takes `inactive: true`. */
  | { ok: true; inactive: true }
  | { ok: true; inactive: false; schedule: ImportSchedule }
  | { ok: false; errors: string[] }

const WEEKDAY_BY_INDEX: readonly WeekdayCode[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
const WEEKDAY_CODES = new Set<string>(WEEKDAY_BY_INDEX)
const WEEK_NUMBERS = ['1', '2', '3', '4', '-1'] as const satisfies readonly WeekNumber[]
const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/

function isWeekdayCode(value: string): value is WeekdayCode {
  return WEEKDAY_CODES.has(value)
}

function isWeekNumber(value: string): value is WeekNumber {
  return (WEEK_NUMBERS as readonly string[]).includes(value)
}

export function isScheduleType(value: string): value is ScheduleType {
  return (SCHEDULE_TYPES as readonly string[]).includes(value)
}

/** `HH:MM`, zero-padded, or null when the value is not a time. */
function normalizeTime(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return TIME_PATTERN.test(trimmed) ? trimmed.padStart(5, '0') : null
}

function parseDate(value: string | undefined): Temporal.PlainDate | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  try {
    return Temporal.PlainDate.from(trimmed)
  } catch {
    return null
  }
}

function parseWeekdays(value: string | undefined): { codes: WeekdayCode[]; invalid: string[] } {
  const codes: WeekdayCode[] = []
  const invalid: string[] = []
  for (const part of (value ?? '').split(',')) {
    const token = part.trim().toUpperCase()
    if (!token) continue
    if (isWeekdayCode(token)) {
      if (!codes.includes(token)) codes.push(token)
    } else {
      invalid.push(part.trim())
    }
  }
  return { codes, invalid }
}

/** The first date on or after `from` whose weekday is one of `codes`. */
function nextMatchingDate(from: Temporal.PlainDate, codes: WeekdayCode[]): Temporal.PlainDate {
  const wanted = new Set(codes.map((code) => WEEKDAY_BY_INDEX.indexOf(code) + 1))
  let candidate = from
  for (let step = 0; step < 7; step += 1) {
    if (wanted.has(candidate.dayOfWeek)) return candidate
    candidate = candidate.add({ days: 1 })
  }
  return from
}

/**
 * The `week`-th `weekday` of `from`'s month, or of the next month when that day
 * has already passed. `week` of `-1` means the last one.
 */
function nextOrdinalWeekdayDate(
  from: Temporal.PlainDate,
  week: WeekNumber,
  weekday: WeekdayCode,
): Temporal.PlainDate {
  for (const monthOffset of [0, 1]) {
    const month = from.add({ months: monthOffset }).with({ day: 1 })
    const candidate = ordinalWeekdayInMonth(month, week, weekday)
    if (candidate && Temporal.PlainDate.compare(candidate, from) >= 0) return candidate
  }
  // Two months is enough for every (week, weekday) pair, so this is unreachable
  // for valid input. Returning `from` keeps the mapper total rather than
  // throwing out of a pure function.
  return from
}

function ordinalWeekdayInMonth(
  monthStart: Temporal.PlainDate,
  week: WeekNumber,
  weekday: WeekdayCode,
): Temporal.PlainDate | null {
  const wanted = WEEKDAY_BY_INDEX.indexOf(weekday) + 1
  const matches: Temporal.PlainDate[] = []
  for (let day = 1; day <= monthStart.daysInMonth; day += 1) {
    const date = monthStart.with({ day })
    if (date.dayOfWeek === wanted) matches.push(date)
  }
  if (!matches.length) return null
  if (week === '-1') return matches[matches.length - 1]!
  return matches[Number(week) - 1] ?? null
}

/** A local date and time in `timezone`, as the UTC instant the column stores. */
function toInstant(date: Temporal.PlainDate, time: string, timezone: string): string {
  const zoned = Temporal.ZonedDateTime.from(`${date.toString()}T${time}:00[${timezone}]`)
  return new Date(zoned.toInstant().epochMilliseconds).toISOString()
}

/**
 * Build the schedule for one row, or list every reason it cannot be built.
 *
 * Errors accumulate rather than short-circuit: a volunteer fixing a CSV wants
 * both the bad time and the bad weekday in one pass, not one per re-upload.
 */
export function mapCsvSchedule(args: MapScheduleArgs): MapScheduleResult {
  const { timezone, today } = args
  const errors: string[] = []

  const rawType = args.scheduleType?.trim().toLowerCase() ?? ''
  if (!isScheduleType(rawType)) {
    return {
      ok: false,
      errors: [`scheduleType must be one of ${SCHEDULE_TYPES.join(', ')} (got "${rawType}")`],
    }
  }
  if (rawType === 'inactive') return { ok: true, inactive: true }

  const startTime = normalizeTime(args.startTime)
  if (!startTime) {
    errors.push(
      args.startTime?.trim()
        ? `startTime must be HH:MM in 24-hour format (got "${args.startTime.trim()}")`
        : 'startTime is required unless scheduleType is inactive',
    )
  }

  const endTime = args.endTime?.trim() ? normalizeTime(args.endTime) : null
  if (args.endTime?.trim() && !endTime) {
    errors.push(`endTime must be HH:MM in 24-hour format (got "${args.endTime.trim()}")`)
  }
  if (startTime && endTime && endTime <= startTime) {
    errors.push('endTime must be after startTime')
  }

  const explicitDate = args.date?.trim() ? parseDate(args.date) : null
  if (args.date?.trim() && !explicitDate) {
    errors.push(`date must be YYYY-MM-DD (got "${args.date.trim()}")`)
  }

  const untilDate = args.untilDate?.trim() ? parseDate(args.untilDate) : null
  if (args.untilDate?.trim() && !untilDate) {
    errors.push(`untilDate must be YYYY-MM-DD (got "${args.untilDate.trim()}")`)
  }

  let interval = 1
  if (args.interval?.trim()) {
    const parsed = Number(args.interval.trim())
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 99) {
      errors.push(`interval must be a whole number from 1 to 99 (got "${args.interval.trim()}")`)
    } else {
      interval = parsed
    }
  }

  const { codes: weekdays, invalid } = parseWeekdays(args.weekdays)
  if (invalid.length) {
    errors.push(`weekdays must be two-letter codes like MO,TH (got "${invalid.join(', ')}")`)
  }

  const built =
    rawType === 'one-off'
      ? buildOneOff({ explicitDate, errors })
      : rawType === 'weekly'
        ? buildWeekly({ explicitDate, weekdays, today, errors })
        : buildMonthly({ explicitDate, weekdays, monthWeek: args.monthWeek, today, errors })

  if (errors.length || !built || !startTime) return { ok: false, errors }

  if (untilDate && explicitDate && Temporal.PlainDate.compare(untilDate, explicitDate) < 0) {
    return { ok: false, errors: ['untilDate must be on or after date'] }
  }

  const schedule: ImportSchedule = {
    firstDate: toInstant(built.firstDate, startTime, timezone),
    firstDate_tz: timezone,
    interval,
    ...built.recurrence,
  }
  if (endTime) schedule.endTime = endTime
  if (untilDate) {
    schedule.endingType = 'until'
    schedule.untilDate = untilDate.toString()
  }

  return { ok: true, inactive: false, schedule }
}

/** What each schedule type contributes beyond the first date. */
type Built = { firstDate: Temporal.PlainDate; recurrence: Partial<ImportSchedule> }

function buildOneOff(args: {
  explicitDate: Temporal.PlainDate | null
  errors: string[]
}): Built | null {
  if (!args.explicitDate) {
    // No fallback: "the next matching day" needs a weekday or an ordinal to
    // match, and a one-off row carries neither. Picking today would schedule
    // every such row for the day of the upload.
    args.errors.push('date is required for a one-off class')
    return null
  }
  return { firstDate: args.explicitDate, recurrence: {} }
}

function buildWeekly(args: {
  explicitDate: Temporal.PlainDate | null
  weekdays: WeekdayCode[]
  today: Temporal.PlainDate
  errors: string[]
}): Built | null {
  const { explicitDate, weekdays, today, errors } = args
  // A date alone says which weekday it is, so only a row with neither is stuck.
  const codes = weekdays.length
    ? weekdays
    : explicitDate
      ? [WEEKDAY_BY_INDEX[explicitDate.dayOfWeek - 1]!]
      : []
  if (!codes.length) {
    errors.push('weekly needs weekdays, or a date to take the weekday from')
    return null
  }
  const firstDate = explicitDate ?? nextMatchingDate(today, codes)
  return { firstDate, recurrence: { recurrenceType: 'WEEKLY', weekdays: codes } }
}

/**
 * Monthly has two shapes the CMS stores differently, and nothing can tell them
 * apart but the columns: `monthWeek` plus one weekday is "the 2nd Tuesday",
 * while a bare `date` is "day 14 of the month". Guessing either way silently
 * reschedules the class, so a row that asks for both gets neither.
 */
function buildMonthly(args: {
  explicitDate: Temporal.PlainDate | null
  weekdays: WeekdayCode[]
  monthWeek: string | undefined
  today: Temporal.PlainDate
  errors: string[]
}): Built | null {
  const { explicitDate, weekdays, today, errors } = args
  const monthWeek = args.monthWeek?.trim()

  if (!monthWeek) {
    if (weekdays.length) {
      errors.push('monthly with weekdays also needs monthWeek (1-4, or -1 for the last)')
      return null
    }
    if (!explicitDate) {
      errors.push('monthly needs a date, or monthWeek plus one weekday')
      return null
    }
    return {
      firstDate: explicitDate,
      recurrence: { recurrenceType: 'MONTHLY', monthlyMode: 'date', monthDay: explicitDate.day },
    }
  }

  if (!isWeekNumber(monthWeek)) {
    errors.push(`monthWeek must be 1, 2, 3, 4 or -1 (got "${monthWeek}")`)
    return null
  }
  if (weekdays.length !== 1) {
    errors.push(
      weekdays.length
        ? `monthWeek needs exactly one weekday (got ${weekdays.length})`
        : 'monthWeek needs exactly one weekday',
    )
    return null
  }

  const weekday = weekdays[0]!
  return {
    firstDate: explicitDate ?? nextOrdinalWeekdayDate(today, monthWeek, weekday),
    recurrence: {
      recurrenceType: 'MONTHLY',
      monthlyMode: 'weekday',
      weekNumber: monthWeek,
      weekdayOfMonth: weekday,
    },
  }
}
