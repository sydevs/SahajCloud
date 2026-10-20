/**
 * Map a CSV row's schedule columns onto the `scheduleFields` group.
 *
 * The columns carry the Events field names and values (`recurrenceType`,
 * `weekdays`, `interval`, `untilDate`), so this is one Zod schema:
 * the shape of each cell, then the rules across cells. What Payload's own
 * schedule validators already refuse — an interval out of range, an end time
 * before the start — is left to them (`../validate.ts`).
 *
 * ⚠ **`date` is required, and nothing is derived from today.** Picking "the next matching weekday" for a blank date
 * built two different first occurrences from one CSV uploaded on two days.
 */

import type { RawImportRow } from './columns'

import { Temporal } from '@js-temporal/polyfill'
import { z } from 'zod'

import { localWallTimeToInstant } from '@/lib/schedule/time'
import type { SupportedTimezones } from '@/payload-types'
import type { EventSchedule } from '@/types/schedule'

import { RECURRENCE_TYPES, WEEKDAY_CODES } from './columns'
import { messagesOf } from './fieldChecks'

type WeekdayCode = (typeof WEEKDAY_CODES)[number]
type RecurrenceType = (typeof RECURRENCE_TYPES)[number]

/** The subset of the schedule group an import writes. */
export interface ImportSchedule {
  firstDate: EventSchedule['firstDate']
  firstDate_tz: SupportedTimezones
  recurrenceType?: RecurrenceType
  interval: number
  weekdays?: WeekdayCode[]
  monthlyMode?: 'date'
  monthDay?: number
  endTime?: string
  /** The import only ever writes an `until` ending, never a `count`. */
  endingType?: 'until'
  untilDate?: string
}

export type MapScheduleResult =
  { ok: true; schedule: ImportSchedule } | { ok: false; errors: string[] }

/**
 * The last day of the month every month has. A monthly `date` past it lands on
 * a day some months lack, and the recurrence skips those months outright.
 */
const MAX_SAFE_MONTH_DAY = 28

/** The schedule columns that mean nothing on a one-off class. */
const REPEATING = ['weekdays', 'interval', 'untilDate'] as const

/** A cell left blank, or one `schema` accepts. */
const blankOr = (schema: z.ZodType, message: string) =>
  z.string().refine((value) => !value || schema.safeParse(value).success, message)
const DATE = 'must be YYYY-MM-DD'
const TIME = 'must be HH:MM, 24-hour, e.g. 09:30'
const upper = (value: unknown) => (typeof value === 'string' ? value.toUpperCase() : value)

const scheduleColumns = z.object({
  recurrenceType: z.preprocess(
    upper,
    z.enum(['', ...RECURRENCE_TYPES], {
      error: `must be ${RECURRENCE_TYPES.join(', ')}, or blank for a one-off class`,
    }),
  ),
  date: z.iso.date({ error: DATE }),
  startTime: z.iso.time({ precision: -1, error: TIME }),
  endTime: blankOr(z.iso.time({ precision: -1 }), TIME),
  weekdays: z.preprocess(
    (value) => [
      ...new Set(
        String(upper(value) ?? '')
          .split(',')
          .map((code) => code.trim())
          .filter(Boolean),
      ),
    ],
    z.array(z.enum(WEEKDAY_CODES, { error: `must be codes from ${WEEKDAY_CODES.join(',')}` })),
  ),
  interval: blankOr(z.string().regex(/^\d+$/), 'must be a whole number'),
  untilDate: blankOr(z.iso.date(), DATE),
})

type ScheduleColumns = z.output<typeof scheduleColumns>

/**
 * The rules across columns. ⚠ `today` is in the class's own zone and injected,
 * so "has already passed" is testable without the wall clock.
 */
function crossChecks(today: Temporal.PlainDate) {
  return (row: ScheduleColumns, ctx: z.RefinementCtx) => {
    const fail = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message })
    const first = dateOf(row.date)
    if (!first) return

    const type = row.recurrenceType
    if (!type) {
      for (const column of REPEATING)
        if (row[column].length) fail(column, 'does not apply to a one-off class')
      if (Temporal.PlainDate.compare(first, today) < 0)
        fail('date', `has already passed (today is ${today})`)
    }
    if ((type === 'DAILY' || type === 'MONTHLY') && row.weekdays.length) {
      fail('weekdays', `does not apply to a ${type.toLowerCase()} class`)
    }
    if (type === 'WEEKLY' && row.weekdays.length && !row.weekdays.includes(weekdayOf(first))) {
      fail('date', `is a ${weekdayOf(first)}, which is not in weekdays`)
    }
    if (type === 'MONTHLY' && first.day > MAX_SAFE_MONTH_DAY) {
      fail(
        'date',
        `falls on day ${first.day}, which some months lack — pick day ${MAX_SAFE_MONTH_DAY} or earlier`,
      )
    }
    const until = dateOf(row.untilDate)
    if (until) {
      if (Temporal.PlainDate.compare(until, today) < 0)
        fail('untilDate', `has already passed (today is ${today})`)
      else if (Temporal.PlainDate.compare(until, first) < 0)
        fail('untilDate', 'must be on or after date')
    }
  }
}

/** The date a cell holds, or null for a blank or malformed one (refused above). */
function dateOf(value: string): null | Temporal.PlainDate {
  return value && z.iso.date().safeParse(value).success ? Temporal.PlainDate.from(value) : null
}

function weekdayOf(day: Temporal.PlainDate): WeekdayCode {
  return WEEKDAY_CODES[day.dayOfWeek - 1]!
}

/**
 * Build the schedule for one row, or list every reason it cannot be built —
 * all at once, so a volunteer fixes the row in one pass.
 */
export function mapCsvSchedule(
  values: RawImportRow,
  timezone: SupportedTimezones,
  today: Temporal.PlainDate,
): MapScheduleResult {
  const cells = Object.fromEntries(
    Object.keys(scheduleColumns.shape).map((key) => [key, values[key] ?? '']),
  )
  const parsed = scheduleColumns.superRefine(crossChecks(today)).safeParse(cells)
  if (!parsed.success) return { ok: false, errors: messagesOf(parsed.error.issues, values) }
  const row = parsed.data

  const first = Temporal.PlainDate.from(row.date)
  let firstDate: string
  try {
    firstDate = localWallTimeToInstant(row.date, row.startTime, timezone, 'reject')
  } catch {
    // The clocks move forward over this wall time, so it never happens that day.
    return {
      ok: false,
      errors: [
        `startTime ${row.startTime} does not exist on ${row.date} in ${timezone} — the clocks move forward. Pick another time or date.`,
      ],
    }
  }

  const type = row.recurrenceType || undefined
  return {
    ok: true,
    schedule: {
      firstDate,
      firstDate_tz: timezone,
      interval: row.interval ? Number(row.interval) : 1,
      ...(type && { recurrenceType: type }),
      ...(type === 'WEEKLY' && {
        weekdays: row.weekdays.length ? row.weekdays : [weekdayOf(first)],
      }),
      // ⚠ Monthly recurs on the date's day of the month. "The 2nd Tuesday" is
      // edited in the admin after the import.
      ...(type === 'MONTHLY' && { monthlyMode: 'date' as const, monthDay: first.day }),
      ...(row.endTime && { endTime: row.endTime }),
      ...(row.untilDate && { endingType: 'until' as const, untilDate: row.untilDate }),
    },
  }
}
