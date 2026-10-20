/**
 * A class's schedule in a few words, for the import result's Details column:
 * "Every week on Tuesday at 7 PM GMT", "One-off on 12 Nov · 18:00", "Inactive".
 *
 * Two readers, because two sources: a created class's live schedule (which
 * may have been edited since), and a skipped row's CSV cells, which may be
 * the very thing that is wrong — so those are echoed rather than validated.
 */

import { Temporal } from '@js-temporal/polyfill'
import { toText } from 'rrule-temporal/totext'

import { buildRRuleTemporal, getLocalTimeHHMM } from '@/lib/schedule/scheduleHooks'
import type { EventSchedule } from '@/types/schedule'

const DAY: Record<string, string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
}

const days = (codes: readonly string[]): string => codes.map((code) => DAY[code] ?? code).join(', ')

function ordinal(day: number): string {
  const tens = day % 100
  if (tens >= 11 && tens <= 13) return `${day}th`
  return `${day}${['th', 'st', 'nd', 'rd'][day % 10] ?? 'th'}`
}

function shortDate(iso: string): string {
  try {
    return Temporal.PlainDate.from(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short' })
  } catch {
    return iso
  }
}

const withTime = (text: string, time: null | string | undefined): string =>
  time ? `${text} · ${time}` : text

/**
 * A created class's schedule as it stands now, in the words the Events form's
 * own schedule summary uses (`rrule-temporal`'s `toText`). A one-off reads
 * "every day … for 1 time" there, so it gets its own short sentence.
 */
export function liveScheduleSummary(
  schedule: Partial<EventSchedule> | null | undefined,
  inactive: boolean | null | undefined,
): string {
  if (inactive || !schedule?.firstDate) return 'Inactive'
  if (!schedule.recurrenceType) {
    const zone = schedule.firstDate_tz ?? 'UTC'
    try {
      const local = Temporal.Instant.from(schedule.firstDate).toZonedDateTimeISO(zone)
      return withTime(
        `One-off on ${shortDate(local.toPlainDate().toString())}`,
        getLocalTimeHHMM(schedule.firstDate, zone),
      )
    } catch {
      return 'One-off'
    }
  }
  const rule = buildRRuleTemporal(schedule)
  if (!rule) return '—'
  const text = toText(rule)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** A skipped row's schedule cells, echoed as the volunteer wrote them. */
export function csvScheduleSummary(values: Readonly<Record<string, string>> | undefined): string {
  const type = values?.recurrenceType?.toUpperCase()
  const time = values?.startTime
  const date = values?.date ?? ''
  const weekdayCodes = (values?.weekdays ?? '')
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean)
  switch (type) {
    case 'DAILY':
      return withTime('Daily', time)
    case 'WEEKLY':
      return withTime(
        weekdayCodes.length ? `Weekly on ${days(weekdayCodes)}` : `Weekly from ${shortDate(date)}`,
        time,
      )
    case 'MONTHLY': {
      const day = Number(date.slice(8, 10))
      return withTime(day ? `Monthly on the ${ordinal(day)}` : 'Monthly', time)
    }
    case '':
    case undefined:
      return date ? withTime(`One-off on ${shortDate(date)}`, time) : '—'
    default:
      return withTime(type, time)
  }
}
