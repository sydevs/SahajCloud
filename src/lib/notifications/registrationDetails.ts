/**
 * Shape an Event into the facts a registrant's confirmation email shows.
 *
 * Sibling of `eventDetails.ts`, which shapes the same Event for the *manager*
 * verification email. They differ in audience, not in domain, so the recurrence
 * and address formatting is shared from there rather than reimplemented — the
 * two emails describing the same class differently would be a bug of its own.
 *
 * Everything here is data, not chrome: nothing in this module is translated.
 * Localized labels come from `@/lib/translations/emailStrings`.
 */

import { convertLexicalToPlaintext } from '@payloadcms/richtext-lexical/plaintext'

import { getLocalTimeHHMM } from '@/lib/schedule/scheduleHooks'
import type { Event } from '@/payload-types'

import { addressOneLine, recurrencePhrase } from './eventDetails'

type Schedule = NonNullable<Event['schedule']>

/** Times render in `en-US` — this is the event's data, not the registrant's locale. */
const TIME_LOCALE = 'en-US'

/**
 * ICU emits a narrow no-break space (U+202F) before AM/PM, which survives into
 * the email as a stray glyph in some clients. Normalize to a plain space.
 */
function normalizeSpaces(value: string): string {
  return value.replace(/ /g, ' ')
}

/** Wall-clock time in the event's timezone, e.g. `7:00 PM`. */
function formatTime(date: Date, timezone: string, withZone = false): string {
  return normalizeSpaces(
    new Intl.DateTimeFormat(TIME_LOCALE, {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      ...(withZone && { timeZoneName: 'short' }),
    }).format(date),
  )
}

/** Minutes since local midnight for an `HH:MM` string, or `null` if malformed. */
function minutesOfDay(hhmm: string | null | undefined): number | null {
  const match = hhmm?.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const [, hour, minute] = match.map(Number)
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

/** Render minutes-since-midnight in 12-hour form, e.g. `8:30 PM`. */
function formatMinutesOfDay(minutes: number): string {
  const hour24 = Math.floor(minutes / 60)
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  const minute = String(minutes % 60).padStart(2, '0')
  return `${hour12}:${minute} ${hour24 < 12 ? 'AM' : 'PM'}`
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
function timeSpan(schedule: Schedule): string {
  const timezone: string = schedule.firstDate_tz || 'UTC'
  const start = new Date(schedule.firstDate)
  if (Number.isNaN(start.getTime())) return ''
  return formatTimeSpan(start, schedule.firstDate, schedule.endTime, timezone)
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
): string {
  const endMinutes = minutesOfDay(endTime)
  const startMinutes = minutesOfDay(getLocalTimeHHMM(startIso, timezone))
  if (endMinutes === null || startMinutes === null || endMinutes <= startMinutes) {
    return formatTime(date, timezone, true)
  }
  return `${formatTime(date, timezone)} – ${formatMinutesOfDay(endMinutes)} ${zoneName(date, timezone)}`
}

/** The short timezone label alone, e.g. `GMT+1`. */
function zoneName(date: Date, timezone: string): string {
  const part = new Intl.DateTimeFormat(TIME_LOCALE, { timeZone: timezone, timeZoneName: 'short' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName')
  return part?.value ?? ''
}

/** Full date for a one-off, e.g. `Tuesday, 21 July 2026`. */
function formatFullDate(schedule: Schedule): string {
  const timezone: string = schedule.firstDate_tz || 'UTC'
  const date = new Date(schedule.firstDate)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
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
 * count is *not* appended here — it is a translated string, so the caller
 * appends it from `emailStrings.sessions_count`.
 */
export function registrationScheduleLine(schedule: Schedule | null | undefined): string {
  if (!schedule?.firstDate) return ''
  const when = schedule.recurrenceType ? recurrencePhrase(schedule) : formatFullDate(schedule)
  return [when, timeSpan(schedule)].filter(Boolean).join(', ')
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

/** Plain-text event description, or `null` when the richText field is empty. */
export function descriptionText(description: Event['description']): string | null {
  if (!description || typeof description !== 'object') return null
  try {
    const text = convertLexicalToPlaintext({ data: description as never }).trim()
    return text || null
  } catch {
    // Malformed editor state must not block a confirmation email.
    return null
  }
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
): string {
  if (!schedule?.firstDate) return ''
  const timezone: string = schedule.firstDate_tz || 'UTC'
  const occurrence = new Date(occurrenceIso)
  if (Number.isNaN(occurrence.getTime())) return ''

  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(occurrence)

  const time = formatTimeSpan(occurrence, occurrenceIso, schedule.endTime, timezone)
  return [date, time].filter(Boolean).join(', ')
}

/**
 * Build the confirmation email's content from an Event.
 *
 * Pure and synchronous — every value comes off the already-loaded document, so
 * this issues no queries and stays unit-testable.
 */
export function buildRegistrationEmailDetails(event: Event): RegistrationEmailDetails {
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
    scheduleLine: registrationScheduleLine(event.schedule),
    sessions: sessionCount(event.schedule),
    location,
    description: descriptionText(event.description),
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
): RegistrationEmailDetails {
  return {
    ...buildRegistrationEmailDetails(event),
    scheduleLine: occurrenceLine(event.schedule, occurrenceIso),
    sessions: null,
  }
}
