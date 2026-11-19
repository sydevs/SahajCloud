import type { FormState } from 'payload'

import { Temporal } from '@js-temporal/polyfill'
import { toText } from 'rrule-temporal/totext'

/** Extracted schedule sub-field values from form state. */
interface ScheduleFormValues {
  firstDate?: string
  firstDate_tz?: string
  recurrenceType?: string
  interval?: number
  weekdays?: string[]
  monthlyMode?: string
  monthDay?: number
  weekNumber?: string
  weekdayOfMonth?: string
  endingType?: string
  count?: number
  untilDate?: string
  breaks: number
}

/** What the banner says. */
interface Summary {
  title: string
  detail: string
}

const EMPTY: Summary = {
  title: 'No schedule yet',
  detail:
    'Set the first date and time below, and how often it repeats. A summary appears here as you fill them in.',
}

/**
 * Read the schedule group's values from form state, where its sub-fields sit
 * as flat paths: `{groupPath}.{subField}`.
 */
function extractScheduleValues(formState: FormState, groupPath: string): ScheduleFormValues {
  const get = (subField: string) => formState[`${groupPath}.${subField}`]?.value
  const exclusions = formState[`${groupPath}.exclusions`]
  return {
    firstDate: get('firstDate') as string | undefined,
    firstDate_tz: get('firstDate_tz') as string | undefined,
    recurrenceType: get('recurrenceType') as string | undefined,
    interval: get('interval') as number | undefined,
    weekdays: get('weekdays') as string[] | undefined,
    monthlyMode: get('monthlyMode') as string | undefined,
    monthDay: get('monthDay') as number | undefined,
    weekNumber: get('weekNumber') as string | undefined,
    weekdayOfMonth: get('weekdayOfMonth') as string | undefined,
    endingType: get('endingType') as string | undefined,
    count: get('count') as number | undefined,
    untilDate: get('untilDate') as string | undefined,
    breaks: exclusions?.rows?.length ?? 0,
  }
}

/** Format a ZonedDateTime as an iCalendar local datetime string: YYYYMMDDTHHmmss */
function formatLocalDateTime(zdt: Temporal.ZonedDateTime): string {
  const Y = String(zdt.year).padStart(4, '0')
  const M = String(zdt.month).padStart(2, '0')
  const D = String(zdt.day).padStart(2, '0')
  const h = String(zdt.hour).padStart(2, '0')
  const m = String(zdt.minute).padStart(2, '0')
  const s = String(zdt.second).padStart(2, '0')
  return `${Y}${M}${D}T${h}${m}${s}`
}

/**
 * Build an iCalendar string (DTSTART + RRULE) from form values for passing to toText().
 * Only handles recurring events. Returns null if firstDate is missing or invalid.
 *
 * SYNC NOTE: This mirrors the RRULE building logic from buildRRuleTemporal() in
 * scheduleHooks.ts. Changes to recurrence options (new frequencies, ending types,
 * monthly modes, etc.) must be reflected in both locations.
 */
function buildIcalString(values: ScheduleFormValues): string | null {
  if (!values.firstDate || !values.recurrenceType) return null

  const timezone = values.firstDate_tz || 'UTC'

  let zdt: Temporal.ZonedDateTime
  try {
    zdt = Temporal.Instant.from(values.firstDate).toZonedDateTimeISO(timezone)
  } catch {
    return null
  }

  const dtstart = `DTSTART;TZID=${timezone}:${formatLocalDateTime(zdt)}`
  const params: string[] = [`FREQ=${values.recurrenceType}`]

  const interval = values.interval ?? 1
  if (interval > 1) {
    params.push(`INTERVAL=${interval}`)
  }

  if (values.recurrenceType === 'WEEKLY' && values.weekdays && values.weekdays.length > 0) {
    params.push(`BYDAY=${values.weekdays.join(',')}`)
  }

  if (values.recurrenceType === 'MONTHLY') {
    const monthlyMode = values.monthlyMode || 'date'
    if (monthlyMode === 'date') {
      const day = values.monthDay ?? zdt.day
      params.push(`BYMONTHDAY=${day}`)
    } else {
      const weekNum = parseInt(values.weekNumber || '1', 10)
      const weekday = values.weekdayOfMonth || 'MO'
      params.push(`BYDAY=${weekNum}${weekday}`)
    }
  }

  if (values.endingType === 'count' && values.count && values.count > 0) {
    params.push(`COUNT=${values.count}`)
  } else if (values.endingType === 'until' && values.untilDate) {
    const datePart = values.untilDate.includes('T')
      ? values.untilDate.split('T')[0]
      : values.untilDate
    if (datePart) {
      const formatted = datePart.replace(/-/g, '')
      params.push(`UNTIL=${formatted}T235959Z`)
    }
  }

  return `${dtstart}\nRRULE:${params.join(';')}`
}

function formatDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/**
 * The schedule as the banner states it: the recurrence in words as its title
 * (`rrule-temporal`'s `toText`), or the one date of a one-off; and below it,
 * where the series starts and how many breaks it takes. Until a first date is
 * set, what to fill in.
 */
export function summarizeSchedule(formState: FormState, groupPath: string): Summary | null {
  const values = extractScheduleValues(formState, groupPath)
  if (!values.firstDate) return EMPTY

  const timeZone = values.firstDate_tz || 'UTC'
  const first = new Date(values.firstDate)
  if (isNaN(first.getTime())) return null

  try {
    if (!values.recurrenceType) {
      return {
        title: `Once, on ${formatDate(first, timeZone)} at ${formatTime(first, timeZone)}`,
        detail: `Times are in ${timeZone}.`,
      }
    }

    const ical = buildIcalString(values)
    if (!ical) return null
    const breaks = values.breaks ? `, with ${plural(values.breaks, 'scheduled break')}` : ''
    return {
      title: toText(ical).replace(/^./, (char) => char.toUpperCase()),
      detail: `Starting ${formatDate(first, timeZone)}${breaks}.`,
    }
  } catch {
    return null
  }
}
