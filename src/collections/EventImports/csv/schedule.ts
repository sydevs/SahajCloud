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
 *
 * ⚠ **`date` is required for every type but `inactive`, and nothing is
 * derived from today.** An earlier version picked "the next matching weekday"
 * for a row that left it blank, so the same CSV uploaded on two days built two
 * different first occurrences and the reviewer could not see which.
 */

import type { RawImportRow } from './columns'

import { Temporal } from '@js-temporal/polyfill'

import { localWallTimeToInstant, normalizeHHMM } from '@/lib/schedule/time'
import { isWeekdayCode, weekdayCodeFor } from '@/lib/schedule/weekdays'
import type { SupportedTimezones } from '@/payload-types'
import type { EventSchedule } from '@/types/schedule'

type WeekdayCode = NonNullable<EventSchedule['weekdays']>[number]

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
  endTime?: NonNullable<EventSchedule['endTime']>
  /** The import only ever writes an `until` ending, never a `count`. */
  endingType?: 'until'
  untilDate?: NonNullable<EventSchedule['untilDate']>
}

/**
 * The schedule columns off one CSV row, paired with the context both readers
 * supply themselves.
 *
 * ⚠ **One projection, because two would diverge silently.** The resolve step and
 * the commit both map the same row's schedule, `RawImportRow` is a
 * `Record<string, string>`, and `MapScheduleArgs` has every key optional — so a
 * schedule column added to one spelling and not the other builds a different
 * recurrence from the one the reviewer approved, with no type error and no
 * refused write.
 */
export function scheduleArgsFor(
  values: RawImportRow,
  timezone: SupportedTimezones,
  today: Temporal.PlainDate,
): MapScheduleArgs {
  return {
    scheduleType: values.scheduleType,
    date: values.date,
    startTime: values.startTime,
    endTime: values.endTime,
    weekdays: values.weekdays,
    interval: values.interval,
    untilDate: values.untilDate,
    timezone,
    today,
  }
}

/** The schedule columns as the parser hands them over, plus the row's context. */
export interface MapScheduleArgs {
  scheduleType?: string
  date?: string
  startTime?: string
  endTime?: string
  weekdays?: string
  interval?: string
  untilDate?: string
  /** Already narrowed to a zone the `firstDate_tz` column accepts. */
  timezone: SupportedTimezones
  /**
   * Today, in the event's own zone — what "has already passed" is measured
   * against.
   *
   * Injected because both the one-off `date` and `untilDate` are compared to
   * it, so a spec asserting either refusal cannot be written against the wall
   * clock.
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

/**
 * The last day of the month every month has. A monthly `date` past it lands on
 * a day some months lack, and the recurrence skips those months outright.
 */
const MAX_SAFE_MONTH_DAY = 28

/** The schedule columns that arrive as raw CSV text. */
type ScheduleColumn =
  | 'date'
  | 'startTime'
  | 'endTime'
  | 'weekdays'
  | 'interval'
  | 'untilDate'

/**
 * Schedule columns each type does not read.
 *
 * A value in one of these is a misunderstanding, not a spare field, so it is
 * reported rather than dropped.
 */
const IGNORED_COLUMNS: Record<ScheduleType, readonly ScheduleColumn[]> = {
  'one-off': ['weekdays', 'interval', 'untilDate'],
  weekly: [],
  monthly: ['weekdays'],
  inactive: ['date', 'startTime', 'endTime', 'weekdays', 'interval', 'untilDate'],
}

function ignoredColumnsError(type: ScheduleType, args: MapScheduleArgs): string | null {
  const ignored = IGNORED_COLUMNS[type].filter((name) => args[name]?.trim())
  if (!ignored.length) return null
  const got = ignored.map((name) => `${name} "${args[name]!.trim()}"`).join(', ')
  const article = type === 'inactive' ? 'an' : 'a'
  return `${ignored.join(' and ')} ${ignored.length > 1 ? 'do' : 'does'} not apply to ${article} ${type} class (got ${got})`
}

function isScheduleType(value: string): value is ScheduleType {
  return (SCHEDULE_TYPES as readonly string[]).includes(value)
}

/**
 * A strict `YYYY-MM-DD` date, or null.
 *
 * ⚠ **Strict because `Temporal` would also accept a datetime**, and a
 * volunteer's spreadsheet silently exporting one must be refused rather than
 * truncated. `scheduleHooks.parseDateOnly` is the tolerant twin, and these two
 * are the only leniency policies the import has — the commit reads the stored
 * `anchorDate` with this one rather than adding a third.
 */
export function parseIsoDate(value: string | undefined): Temporal.PlainDate | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  try {
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
  if (rawType === 'inactive') {
    // A dormant class with a time filled in is usually a weekly one marked
    // wrong, and publishing it dormant would hide the time the volunteer gave.
    const ignored = ignoredColumnsError(rawType, args)
    return ignored ? { ok: false, errors: [ignored] } : { ok: true, inactive: true }
  }

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
  const explicitDate = rawDate ? parseIsoDate(rawDate) : null
  if (rawDate && !explicitDate) errors.push(`date must be YYYY-MM-DD (got "${rawDate}")`)

  const rawUntilDate = args.untilDate?.trim()
  const untilDate = rawUntilDate ? parseIsoDate(rawUntilDate) : null
  if (rawUntilDate && !untilDate) {
    errors.push(`untilDate must be YYYY-MM-DD (got "${rawUntilDate}")`)
  }

  const rawInterval = args.interval?.trim()
  let interval = 1
  if (rawInterval) {
    // Digits only: `Number` also reads `1e1` and `0x10`, which a volunteer did
    // not mean as 10 and 16.
    const parsed = /^\d+$/.test(rawInterval) ? Number(rawInterval) : NaN
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

  const ignored = ignoredColumnsError(rawType, args)
  if (ignored) errors.push(ignored)

  const built = buildFor(rawType, { explicitDate, weekdays, today })
  if (typeof built === 'string') errors.push(built)

  // ⚠ **Against `today`, which is the stored anchor at commit.** Both steps
  // compare against the same date, so a row the reviewer approved cannot be
  // refused by a commit run the next morning.
  const pastUntil = untilDate && Temporal.PlainDate.compare(untilDate, today) < 0
  if (pastUntil) {
    errors.push(
      `untilDate ${untilDate.toString()} has already passed (today is ${today.toString()} in ${timezone}) — a class that has ended needs no import`,
    )
  }

  // The ending is compared against the resolved first date, not against the
  // `date` column: a weekly row leaving `date` blank still has a first date,
  // and an earlier `untilDate` there imported an event with zero occurrences —
  // already expired, with nothing on the row to say so.
  if (untilDate && !pastUntil && typeof built !== 'string') {
    if (Temporal.PlainDate.compare(untilDate, built.firstDate) < 0) {
      errors.push(`untilDate must be on or after the first date (${built.firstDate.toString()})`)
    }
  }

  // `startTime` is re-tested only to narrow it for TypeScript — a missing one
  // has already pushed an error, so this cannot be the branch that decides.
  if (errors.length || typeof built === 'string' || !startTime) return { ok: false, errors }

  let firstDate: string
  try {
    firstDate = localWallTimeToInstant(built.firstDate.toString(), startTime, timezone, 'reject')
  } catch {
    // The clocks moved forward over this wall time, so it never happens on
    // that date. Shifting it silently is what made the import accept a
    // start/end pair that `scheduleFields` then refused.
    return {
      ok: false,
      errors: [
        `${startTime} does not exist on ${built.firstDate.toString()} in ${timezone} — the clocks move forward. Pick another time or date.`,
      ],
    }
  }

  const schedule: ImportSchedule = {
    firstDate,
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

function buildOneOff({ explicitDate, today }: BuildArgs): Built | string {
  if (!explicitDate) return 'date is required for a one-off class'
  // A one-off in the past publishes a class that has already finished, which
  // the expiry sweep would then retire on its first run.
  if (Temporal.PlainDate.compare(explicitDate, today) < 0) {
    return `date ${explicitDate.toString()} has already passed (today is ${today.toString()})`
  }
  return { firstDate: explicitDate, recurrence: {} }
}

function buildWeekly({ explicitDate, weekdays }: BuildArgs): Built | string {
  if (!explicitDate) return 'date is required for a weekly class — its first occurrence'

  // A date alone says which weekday it is, so `weekdays` is for a class that
  // meets on more than one.
  const dateCode = weekdayCodeFor(explicitDate.dayOfWeek)
  const codes = weekdays.length ? weekdays : [dateCode]

  // ⚠ The first date must be a day the class actually runs. `date` is stored
  // as `firstDate` while `weekdays` becomes the RRULE's BYDAY, so a date on
  // another weekday publishes a first occurrence that never happens.
  if (!codes.includes(dateCode)) {
    return `date ${explicitDate.toString()} is a ${dateCode}, which is not in weekdays (${codes.join(',')})`
  }

  return {
    firstDate: explicitDate,
    recurrence: { recurrenceType: 'WEEKLY', weekdays: codes },
  }
}

/**
 * Monthly recurs on `date`'s day of the month.
 *
 * ⚠ **The CMS also stores "the 2nd Tuesday" (`monthlyMode: 'weekday'`), and
 * the import deliberately does not reach it.** Spelling it took a `monthWeek`
 * column, a second set of refusals, and a cross-check that `date` really was
 * that ordinal weekday — for a shape no surveyed region's classes use. A
 * manager who needs one edits the class after the import.
 */
function buildMonthly({ explicitDate }: BuildArgs): Built | string {
  if (!explicitDate) return 'date is required for a monthly class — its first occurrence'
  if (explicitDate.day > MAX_SAFE_MONTH_DAY) {
    return `a monthly class on day ${explicitDate.day} skips every month without one (got date "${explicitDate.toString()}") — pick a date on or before day ${MAX_SAFE_MONTH_DAY}`
  }
  return {
    firstDate: explicitDate,
    recurrence: { recurrenceType: 'MONTHLY', monthlyMode: 'date', monthDay: explicitDate.day },
  }
}
