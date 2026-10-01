/**
 * Map a CSV row's schedule columns onto the `scheduleFields` group.
 *
 * The Atlas seed has a mapper for the same target (`seeds/atlas/helpers/
 * scheduleMapper.ts`) and this is deliberately not it: that one maps a parsed
 * Rails `recurrence_data` and answers a missing field by dropping the schedule,
 * because nobody is waiting on the answer. Here a volunteer is, so every
 * refusal has to name the column that caused it and the row has to survive long
 * enough to be reported.
 *
 * ⚠ **There is deliberately no `daily` scheduleType, though the column
 * enumerates `DAILY`.** A daily class is spelled as `weekly` with all seven
 * weekdays, which produces the same recurrence. A fourth member would make a
 * volunteer choose between two spellings of one thing, and choose wrong half
 * the time.
 */

import { Temporal } from '@js-temporal/polyfill'

import { localWallTimeToInstant, normalizeHHMM } from '@/lib/schedule/time'
import {
  isWeekNumber,
  isWeekdayCode,
  weekdayCodeFor,
  weekdayIndexOf,
} from '@/lib/schedule/weekdays'
import type { SupportedTimezones } from '@/payload-types'
import type { EventSchedule } from '@/types/schedule'

type WeekdayCode = NonNullable<EventSchedule['weekdays']>[number]
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

/** The schedule columns as the parser hands them over, plus the row's context. */
export interface MapScheduleArgs {
  scheduleType?: string
  date?: string
  startTime?: string
  endTime?: string
  weekdays?: string
  interval?: string
  monthWeek?: string
  untilDate?: string
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

const MIN_INTERVAL = 1
const MAX_INTERVAL = 99

function isScheduleType(value: string): value is ScheduleType {
  return (SCHEDULE_TYPES as readonly string[]).includes(value)
}

function parseDate(value: string | undefined): Temporal.PlainDate | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  try {
    // Strict `YYYY-MM-DD`: `Temporal` would also accept a datetime, and a
    // volunteer's spreadsheet silently exporting one must be refused, not
    // truncated. `scheduleHooks.parseDateOnly` is the tolerant twin.
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? Temporal.PlainDate.from(trimmed) : null
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
  const offsets = codes.map((code) => (weekdayIndexOf(code) - from.dayOfWeek + 7) % 7)
  return from.add({ days: Math.min(...offsets) })
}

/**
 * The `week`-th `weekday` of `monthStart`'s month.
 *
 * Total for every value `isWeekNumber` admits: a month has at least 28 days,
 * so it always holds four of every weekday, and `-1` resolves to the last.
 * Cross-checked against a day-by-day scan over 2024-2036 — 5460 cases, no
 * disagreement, and the scan never came up empty.
 */
function ordinalWeekdayInMonth(
  monthStart: Temporal.PlainDate,
  week: WeekNumber,
  weekday: WeekdayCode,
): Temporal.PlainDate {
  const first = 1 + ((weekdayIndexOf(weekday) - monthStart.dayOfWeek + 7) % 7)
  const day =
    week === '-1'
      ? first + Math.floor((monthStart.daysInMonth - first) / 7) * 7
      : first + (Number(week) - 1) * 7
  return monthStart.with({ day })
}

/** That ordinal day this month, or next month's once this month's has passed. */
function nextOrdinalWeekdayDate(
  from: Temporal.PlainDate,
  week: WeekNumber,
  weekday: WeekdayCode,
): Temporal.PlainDate {
  const thisMonth = ordinalWeekdayInMonth(from.with({ day: 1 }), week, weekday)
  if (Temporal.PlainDate.compare(thisMonth, from) >= 0) return thisMonth
  return ordinalWeekdayInMonth(from.add({ months: 1 }).with({ day: 1 }), week, weekday)
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

  const rawStartTime = args.startTime?.trim()
  const startTime = normalizeHHMM(rawStartTime)
  if (!startTime) {
    errors.push(
      rawStartTime
        ? `startTime must be HH:MM in 24-hour format (got "${rawStartTime}")`
        : 'startTime is required unless scheduleType is inactive',
    )
  }

  const rawEndTime = args.endTime?.trim()
  const endTime = rawEndTime ? normalizeHHMM(rawEndTime) : null
  if (rawEndTime && !endTime) {
    errors.push(`endTime must be HH:MM in 24-hour format (got "${rawEndTime}")`)
  }
  if (startTime && endTime && endTime <= startTime) {
    errors.push('endTime must be after startTime')
  }

  const rawDate = args.date?.trim()
  const explicitDate = rawDate ? parseDate(rawDate) : null
  if (rawDate && !explicitDate) errors.push(`date must be YYYY-MM-DD (got "${rawDate}")`)

  const rawUntilDate = args.untilDate?.trim()
  const untilDate = rawUntilDate ? parseDate(rawUntilDate) : null
  if (rawUntilDate && !untilDate) {
    errors.push(`untilDate must be YYYY-MM-DD (got "${rawUntilDate}")`)
  }
  // Accumulated with the rest rather than returned on its own, so a row with a
  // backwards range and a bad weekday reports both.
  if (untilDate && explicitDate && Temporal.PlainDate.compare(untilDate, explicitDate) < 0) {
    errors.push('untilDate must be on or after date')
  }

  const rawInterval = args.interval?.trim()
  let interval = 1
  if (rawInterval) {
    const parsed = Number(rawInterval)
    if (!Number.isInteger(parsed) || parsed < MIN_INTERVAL || parsed > MAX_INTERVAL) {
      errors.push(
        `interval must be a whole number from ${MIN_INTERVAL} to ${MAX_INTERVAL} (got "${rawInterval}")`,
      )
    } else {
      interval = parsed
    }
  }

  const { codes: weekdays, invalid } = parseWeekdays(args.weekdays)
  if (invalid.length) {
    errors.push(`weekdays must be two-letter codes like MO,TH (got "${invalid.join(', ')}")`)
  }

  const built = buildFor(rawType, { explicitDate, weekdays, monthWeek: args.monthWeek, today })
  if (typeof built === 'string') errors.push(built)

  // `startTime` is re-tested only to narrow it for TypeScript — a missing one
  // has already pushed an error, so this cannot be the branch that decides.
  if (errors.length || typeof built === 'string' || !startTime) return { ok: false, errors }

  const schedule: ImportSchedule = {
    firstDate: localWallTimeToInstant(built.firstDate.toString(), startTime, timezone),
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
interface Built {
  firstDate: Temporal.PlainDate
  recurrence: Partial<ImportSchedule>
}

interface BuildArgs {
  explicitDate: Temporal.PlainDate | null
  weekdays: WeekdayCode[]
  monthWeek: string | undefined
  today: Temporal.PlainDate
}

/**
 * The per-type build, returning the one refusal message instead of pushing it.
 *
 * Each arm yields either a `Built` or exactly one message, so the message is
 * the return value — a shared mutable error array would leave a reader
 * verifying by hand that "returned nothing" always means "pushed something".
 */
function buildFor(type: Exclude<ScheduleType, 'inactive'>, args: BuildArgs): Built | string {
  switch (type) {
    case 'one-off':
      return buildOneOff(args)
    case 'weekly':
      return buildWeekly(args)
    case 'monthly':
      return buildMonthly(args)
  }
}

function buildOneOff({ explicitDate }: BuildArgs): Built | string {
  // No fallback: "the next matching day" needs a weekday or an ordinal to
  // match, and a one-off row carries neither. Picking today would schedule
  // every such row for the day of the upload.
  if (!explicitDate) return 'date is required for a one-off class'
  return { firstDate: explicitDate, recurrence: {} }
}

function buildWeekly({ explicitDate, weekdays, today }: BuildArgs): Built | string {
  // A date alone says which weekday it is, so only a row with neither is stuck.
  const codes = weekdays.length
    ? weekdays
    : explicitDate
      ? [weekdayCodeFor(explicitDate.dayOfWeek)]
      : []
  if (!codes.length) return 'weekly needs weekdays, or a date to take the weekday from'
  return {
    firstDate: explicitDate ?? nextMatchingDate(today, codes),
    recurrence: { recurrenceType: 'WEEKLY', weekdays: codes },
  }
}

/**
 * Monthly has two shapes the CMS stores differently, and nothing can tell them
 * apart but the columns: `monthWeek` plus one weekday is "the 2nd Tuesday",
 * while a bare `date` is "day 14 of the month". Guessing either way silently
 * reschedules the class, so a row that asks for both gets neither.
 */
function buildMonthly({ explicitDate, weekdays, monthWeek: raw, today }: BuildArgs): Built | string {
  const monthWeek = raw?.trim()

  if (!monthWeek) {
    if (weekdays.length) {
      return 'monthly with weekdays also needs monthWeek (1-4, or -1 for the last)'
    }
    if (!explicitDate) return 'monthly needs a date, or monthWeek plus one weekday'
    return {
      firstDate: explicitDate,
      recurrence: { recurrenceType: 'MONTHLY', monthlyMode: 'date', monthDay: explicitDate.day },
    }
  }

  if (!isWeekNumber(monthWeek)) {
    return `monthWeek must be 1, 2, 3, 4 or -1 (got "${monthWeek}")`
  }
  if (weekdays.length !== 1) {
    return weekdays.length
      ? `monthWeek needs exactly one weekday (got ${weekdays.length})`
      : 'monthWeek needs exactly one weekday'
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
