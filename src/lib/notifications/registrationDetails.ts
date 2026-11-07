/**
 * Shape an Event into the facts a registrant's confirmation email shows.
 *
 * Sibling of `eventDetails.ts`, which shapes the same Event for the *manager*
 * verification email. They differ in audience, not in domain, so the recurrence
 * and address formatting is shared from there rather than reimplemented — the
 * two emails describing the same class differently would be a bug of its own.
 *
 * The facts are the event's own; how they read — weekday and month names, the
 * clock, the recurrence sentence — follows the registrant's locale, the sentence
 * from the same `event.recurrence` keys the Atlas widget uses.
 */

import type { LocaleCode } from '@/lib/locales'
import { lexicalToPlainText } from '@/lib/richEditor/lexicalToPlainText'
import { getLocalTimeHHMM } from '@/lib/schedule/scheduleHooks'
import { minutesOfDay } from '@/lib/schedule/time'
import {
  EMAIL_STRING_DEFAULTS,
  type EmailStrings,
  interpolate,
} from '@/lib/translations/emailStrings'
import type { Event } from '@/payload-types'

import { addressOneLine } from './eventDetails'

type Schedule = NonNullable<Event['schedule']>

/** The registrant's locale and resolved strings; English when a caller has none. */
export interface ScheduleText {
  locale?: LocaleCode | null
  strings?: EmailStrings
}

/** `en` keeps the day-month dates and 12-hour clock these emails have always used. */
const dateLocale = (locale?: LocaleCode | null) => (!locale || locale === 'en' ? 'en-GB' : locale)
const timeLocale = (locale?: LocaleCode | null) => (!locale || locale === 'en' ? 'en-US' : locale)

/** A Monday, so `MO`…`SU` map onto consecutive days for a localized weekday name. */
const WEEK_START = Date.UTC(2024, 0, 1)
const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

function weekdayName(code: string, locale?: LocaleCode | null): string {
  const index = WEEKDAY_CODES.indexOf(code)
  if (index < 0) return code
  return new Intl.DateTimeFormat(dateLocale(locale), { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(WEEK_START + index * 86_400_000),
  )
}

const MONTHLY_WEEK_KEYS = {
  '1': 'recurrence_monthly_1st',
  '2': 'recurrence_monthly_2nd',
  '3': 'recurrence_monthly_3rd',
  '4': 'recurrence_monthly_4th',
  '-1': 'recurrence_monthly_last',
} as const

/** The recurrence sentence, from the widget's own keys (`use-event-display.ts` in SahajAtlasWeb). */
function recurrenceLine(
  schedule: Schedule,
  { locale, strings = EMAIL_STRING_DEFAULTS }: ScheduleText,
): string {
  const interval = schedule.interval && schedule.interval > 1 ? schedule.interval : 1
  switch (schedule.recurrenceType) {
    case 'DAILY':
      return interval > 1
        ? interpolate(strings.recurrence_daily_n, { interval })
        : strings.recurrence_daily
    case 'WEEKLY': {
      const names = (schedule.weekdays ?? []).map((code) => weekdayName(code, locale))
      const weekday = new Intl.ListFormat(dateLocale(locale), {
        style: 'long',
        type: 'conjunction',
      }).format(names)
      if (interval === 2) return interpolate(strings.recurrence_weekly_2, { weekday })
      if (interval > 2) return interpolate(strings.recurrence_weekly_n, { interval, weekday })
      return names.length > 1
        ? interpolate(strings.recurrence_weekly_multi, { weekdays: weekday })
        : interpolate(strings.recurrence_weekly_1, { weekday })
    }
    case 'MONTHLY': {
      const key =
        schedule.monthlyMode === 'weekday' && schedule.weekdayOfMonth
          ? MONTHLY_WEEK_KEYS[String(schedule.weekNumber) as keyof typeof MONTHLY_WEEK_KEYS]
          : undefined
      if (key) {
        return interpolate(strings[key], {
          weekday: weekdayName(schedule.weekdayOfMonth!, locale),
        })
      }
      return schedule.monthDay
        ? interpolate(strings.recurrence_monthly_date, { day: schedule.monthDay })
        : ''
    }
    default:
      return ''
  }
}

/**
 * ICU emits a narrow no-break space (U+202F) before AM/PM, which survives into
 * the email as a stray glyph in some clients. Normalize to a plain space.
 */
function normalizeSpaces(value: string): string {
  return value.replace(/ /g, ' ')
}

/** Wall-clock time in the event's timezone, e.g. `7:00 PM`, or `19:00` in German. */
function formatTime(date: Date, timezone: string, locale?: LocaleCode | null, withZone = false) {
  return normalizeSpaces(
    new Intl.DateTimeFormat(timeLocale(locale), {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      ...(withZone && { timeZoneName: 'short' }),
    }).format(date),
  )
}

/** Minutes since midnight as a clock time, read as written (no zone, no DST). */
function formatMinutesOfDay(minutes: number, locale?: LocaleCode | null): string {
  return formatTime(new Date(Date.UTC(2024, 0, 1, 0, minutes)), 'UTC', locale)
}

/**
 * Start–end time span with the timezone, e.g. `7:00 PM – 8:30 PM GMT+1`.
 *
 * `endTime` is a same-day local wall-clock string, so it is formatted **as
 * written** rather than by reconstructing an instant. Deriving the end from a
 * real-time offset off the start is wrong across a DST transition: on the day
 * London leaves BST, a 01:00–03:00 event spans two wall-clock hours but three
 * real ones, and an offset-derived end renders as 2:00 AM.
 *
 * With no (or a malformed, or a non-increasing) end time, the span collapses to
 * the start alone.
 */
function timeSpan(schedule: Schedule, locale?: LocaleCode | null): string {
  const timezone: string = schedule.firstDate_tz || 'UTC'
  const start = new Date(schedule.firstDate)
  if (Number.isNaN(start.getTime())) return ''
  return formatTimeSpan(start, schedule.firstDate, schedule.endTime, timezone, locale)
}

/**
 * The start–end time span for one occurrence: `7:00 – 8:30 PM GMT+1`, collapsing
 * to the start alone when there's no usable end. Shared by {@link timeSpan} (the
 * series' first occurrence) and {@link occurrenceLine} (a specific one).
 *
 * @param date - The occurrence instant, formatted for its own DST offset.
 * @param startIso - The same instant as an ISO string, for the local-time lookup.
 * @param endTime - The schedule's same-day wall-clock end, formatted as written
 *   (the zone is printed once, on the end, so the span reads as one unit).
 */
function formatTimeSpan(
  date: Date,
  startIso: string,
  endTime: string | null | undefined,
  timezone: string,
  locale?: LocaleCode | null,
): string {
  const endMinutes = minutesOfDay(endTime)
  const startMinutes = minutesOfDay(getLocalTimeHHMM(startIso, timezone))
  if (endMinutes === null || startMinutes === null || endMinutes <= startMinutes) {
    return formatTime(date, timezone, locale, true)
  }
  return `${formatTime(date, timezone, locale)} – ${formatMinutesOfDay(endMinutes, locale)} ${zoneName(date, timezone, locale)}`
}

/** The short timezone label alone, e.g. `GMT+1`. */
function zoneName(date: Date, timezone: string, locale?: LocaleCode | null): string {
  const part = new Intl.DateTimeFormat(timeLocale(locale), {
    timeZone: timezone,
    timeZoneName: 'short',
  })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName')
  return part?.value ?? ''
}

/** A full date, e.g. `Tuesday, 21 July 2026`, in the event's timezone and the reader's locale. */
function formatFullDate(date: Date, timezone: string, locale?: LocaleCode | null): string {
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(dateLocale(locale), {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/**
 * The number of sessions in a limited-run course, or `null` for an open-ended
 * class. Only a `count`-bounded run has a knowable total — an `until`-bounded
 * one would need the recurrence expanded, which the ICS attachment covers.
 */
export function sessionCount(schedule: Schedule | null | undefined): number | null {
  if (!schedule?.recurrenceType) return null
  if (schedule.endingType !== 'count') return null
  return schedule.count && schedule.count > 0 ? schedule.count : null
}

/**
 * Human schedule line for a registrant, e.g.
 * `Every week on Tuesday, 7:00 – 8:30 PM GMT+1`.
 *
 * A one-off renders its full date instead of a recurrence phrase. The session
 * count is *not* appended here — it is a translated, pluralized string, so the
 * caller appends it via `pluralize(strings, 'sessions_count', …)`.
 */
export function registrationScheduleLine(
  schedule: Schedule | null | undefined,
  text: ScheduleText = {},
): string {
  if (!schedule?.firstDate) return ''
  const when = schedule.recurrenceType
    ? recurrenceLine(schedule, text)
    : formatFullDate(new Date(schedule.firstDate), schedule.firstDate_tz || 'UTC', text.locale)
  return [when, timeSpan(schedule, text.locale)].filter(Boolean).join(', ')
}

/**
 * A maps link for the venue.
 *
 * Prefers the geocoded coordinates (exact, and immune to address typos) and
 * falls back to a text query when the event was never geocoded.
 */
export function mapsUrl(event: Pick<Event, 'address'>): string | null {
  const { latitude, longitude } = event.address ?? {}
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
  }
  const address = addressOneLine(event.address ?? {})
  return address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null
}

/** The "Where" block, discriminated so the template can't render both variants. */
export type RegistrationLocation =
  | { type: 'online'; joinUrl: string }
  | { type: 'offline'; address: string; mapsUrl: string | null }
  | { type: 'unspecified' }

/** Facts the confirmation email renders. Chrome/labels are resolved separately. */
export interface RegistrationEmailDetails {
  eventTitle: string
  scheduleLine: string
  sessions: number | null
  location: RegistrationLocation
  description: string | null
  contact: string | null
}

/**
 * Date + time span for one specific occurrence, e.g.
 * `Tuesday, 21 July 2026, 7:00 – 8:30 PM GMT+1`.
 *
 * The session reminder shows the single upcoming occurrence rather than the
 * series, so it formats *that* occurrence's own date (which differs from
 * `firstDate` for a recurring class) and reads its own DST offset from that
 * instant. The end of the span still comes from `endTime` — a fixed same-day
 * wall-clock string every occurrence shares — formatted as written, the same
 * DST-safe reasoning as {@link registrationScheduleLine}'s `timeSpan`.
 */
export function occurrenceLine(
  schedule: Schedule | null | undefined,
  occurrenceIso: string,
  { locale }: ScheduleText = {},
): string {
  if (!schedule?.firstDate) return ''
  const timezone: string = schedule.firstDate_tz || 'UTC'
  const occurrence = new Date(occurrenceIso)
  if (Number.isNaN(occurrence.getTime())) return ''

  const date = formatFullDate(occurrence, timezone, locale)
  const time = formatTimeSpan(occurrence, occurrenceIso, schedule.endTime, timezone, locale)
  return [date, time].filter(Boolean).join(', ')
}

/**
 * Build the confirmation email's content from an Event.
 *
 * Pure and synchronous — every value comes off the already-loaded document, so
 * this issues no queries and stays unit-testable.
 */
export function buildRegistrationEmailDetails(
  event: Event,
  text: ScheduleText = {},
): RegistrationEmailDetails {
  const address = addressOneLine(event.address ?? {})

  // An online event without a URL falls through to `unspecified` rather than
  // rendering an empty join button.
  let location: RegistrationLocation = { type: 'unspecified' }
  if (event.eventType === 'online') {
    if (event.onlineUrl) location = { type: 'online', joinUrl: event.onlineUrl }
  } else if (address) {
    location = { type: 'offline', address, mapsUrl: mapsUrl(event) }
  }

  const contact = [event.contactName?.trim(), event.contactPhone?.trim()]
    .filter(Boolean)
    .join(' · ')

  return {
    eventTitle: typeof event.title === 'string' ? event.title : `Event #${event.id}`,
    scheduleLine: registrationScheduleLine(event.schedule, text),
    sessions: sessionCount(event.schedule),
    location,
    description: lexicalToPlainText(event.description) || null,
    contact: contact || null,
  }
}

/**
 * Build a session reminder's content: the same event facts as the confirmation,
 * but with the schedule line collapsed to the single upcoming `occurrenceIso`
 * and the session count dropped — a reminder is about one session, not the run.
 */
export function buildReminderEmailDetails(
  event: Event,
  occurrenceIso: string,
  text: ScheduleText = {},
): RegistrationEmailDetails {
  return {
    ...buildRegistrationEmailDetails(event, text),
    scheduleLine: occurrenceLine(event.schedule, occurrenceIso, text),
    sessions: null,
  }
}
