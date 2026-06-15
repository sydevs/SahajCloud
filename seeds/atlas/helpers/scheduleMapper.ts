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

/** The subset of the `scheduleFields` group an import populates. */
export interface ScheduleInput {
  firstDate: string
  firstDate_tz: string
  recurrenceType: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  interval: number
  weekdays?: string[]
  monthlyMode?: 'date' | 'weekday'
  monthDay?: number
  weekNumber?: string
  weekdayOfMonth?: string
  endTime?: string
  endingType?: 'until'
  untilDate?: string
}

const FREQUENCY_TO_RECURRENCE: Record<AtlasSchedule['frequency'], ScheduleInput['recurrenceType']> =
  {
    daily: 'DAILY',
    weekly: 'WEEKLY',
    monthly: 'MONTHLY',
  }

/** Full lowercase weekday name → RFC 5545 two-letter code. */
const WEEKDAY_CODES: Record<string, string> = {
  monday: 'MO',
  tuesday: 'TU',
  wednesday: 'WE',
  thursday: 'TH',
  friday: 'FR',
  saturday: 'SA',
  sunday: 'SU',
}

const WEEK_NUMBERS = new Set(['1', '2', '3', '4', '-1'])
const DEFAULT_TIME = '00:00'

/** Map an Atlas weekday name (case-insensitive) to its two-letter code. */
function weekdayCode(weekday: string | null | undefined): string | undefined {
  if (!weekday) return undefined
  return WEEKDAY_CODES[weekday.trim().toLowerCase()]
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

  const firstDate = toFirstDateUtc(schedule.startDate, schedule.startTime, timeZone || 'UTC')
  if (!firstDate) return null

  const result: ScheduleInput = {
    firstDate,
    firstDate_tz: timeZone || 'UTC',
    recurrenceType,
    interval: schedule.interval && schedule.interval > 0 ? schedule.interval : 1,
  }

  if (recurrenceType === 'WEEKLY') {
    const code = weekdayCode(schedule.weekday)
    if (code) result.weekdays = [code]
  }

  if (recurrenceType === 'MONTHLY') {
    const code = weekdayCode(schedule.weekday)
    if (code) {
      // "1st Saturday" style — by weekday.
      result.monthlyMode = 'weekday'
      const week = String(schedule.weekNumber ?? 1)
      result.weekNumber = WEEK_NUMBERS.has(week) ? week : '1'
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
