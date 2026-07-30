/**
 * Build a downloadable iCalendar (RFC 5545) document for an Event.
 *
 * `computeIcalRule` already exposes a DTSTART/RRULE/EXDATE *fragment* on the
 * schedule field, but a fragment is not importable — a calendar client needs
 * the full `VCALENDAR` envelope. This module wraps it, deriving every
 * recurrence value from `buildRRuleTemporal()` so timezone, `COUNT`/`UNTIL`
 * bounds, and `EXDATE` exclusions have exactly one source of truth.
 *
 * Two details are load-bearing for the "imports correctly into Google *and*
 * Apple Calendar" bar:
 *
 * 1. **VTIMEZONE.** A bare `DTSTART;TZID=Europe/London` with no matching
 *    VTIMEZONE component is under-specified per RFC 5545. Google resolves IANA
 *    names regardless; Apple is inconsistent and can fall back to floating
 *    local time, which drifts a weekly class by an hour across a DST boundary.
 *    `@touch4it/ical-timezones` supplies the real component.
 *
 * 2. **TZID-qualified EXDATE.** `RRuleTemporal.toString()` emits exclusions as
 *    UTC (`EXDATE:20260811T180000Z`) while DTSTART stays TZID-local. Clients
 *    match EXDATE against the recurrence instance, and a UTC value frequently
 *    fails to match a TZID-local series — the cancelled session then still
 *    shows. Passing exclusions through ical-generator's structured `repeating`
 *    with the event timezone set yields `EXDATE;TZID=...:20260811T190000`.
 *
 * @see https://icalendar.org/iCalendar-RFC-5545/
 */

import type { ICalRepeatingOptions } from 'ical-generator'

import { Temporal } from '@js-temporal/polyfill'
import { getVtimezoneComponent } from '@touch4it/ical-timezones'
import ical, { ICalEventRepeatingFreq, ICalWeekday } from 'ical-generator'

import { stripNewlines } from '@/lib/utilities/emailSafeText'
import type { EventScheduleInput, ScheduleSubFields } from '@/types/schedule'

import { buildRRuleTemporal } from './scheduleHooks'

export type { EventScheduleInput }

/** Fallback duration when an event declares no `endTime`. */
const DEFAULT_DURATION_MINUTES = 60

/** `BYDAY` entries may carry an occurrence prefix, e.g. `3TU` = third Tuesday. */
const PREFIXED_WEEKDAY = /^(-?\d+)?([A-Z]{2})$/

export interface EventCalendarInput {
  /** Event title — becomes `SUMMARY`. */
  title: string
  /** Structured schedule sub-fields; the recurrence is derived from these. */
  schedule: EventScheduleInput
  /** Physical address or joining URL — becomes `LOCATION`. */
  location?: string | null
  /** Plain-text description — becomes `DESCRIPTION`. */
  description?: string | null
  /** Canonical link for the event — becomes `URL`. */
  url?: string | null
  /**
   * Stable identifier for the series. Reusing it across sends lets a calendar
   * client update the existing entry instead of creating a duplicate.
   */
  uid?: string | null
}

/**
 * Split ical-generator's `byDay` + `bySetPos` out of RFC 5545 `BYDAY` values.
 *
 * `rrule-temporal` keeps the RFC's prefixed form (`['3TU']`), but
 * ical-generator validates `byDay` against a bare two-letter enum and throws on
 * a prefix. Monthly "third Tuesday" rules therefore have to be split.
 */
function splitByDay(byDay: string[]): Pick<ICalRepeatingOptions, 'byDay' | 'bySetPos'> {
  const days: ICalWeekday[] = []
  const positions = new Set<number>()

  for (const entry of byDay) {
    const match = PREFIXED_WEEKDAY.exec(entry)
    if (!match) continue
    const [, prefix, weekday] = match
    days.push(weekday.toLowerCase() as ICalWeekday)
    if (prefix) positions.add(Number(prefix))
  }

  return {
    byDay: days,
    // `bySetPos` is only valid alongside `byDay`, and only when a prefix existed.
    ...(positions.size > 0 && days.length > 0 && { bySetPos: [...positions] }),
  }
}

/**
 * Resolve the event's end as a Temporal instant.
 *
 * `endTime` is a same-day `HH:MM` local wall-clock string; anything missing or
 * malformed falls back to a fixed duration so the VEVENT always has a DTEND.
 */
function resolveEnd(start: Temporal.ZonedDateTime, endTime: string | null | undefined) {
  const match = endTime?.match(/^(\d{1,2}):(\d{2})$/)
  if (match) {
    const hour = Number(match[1])
    const minute = Number(match[2])
    // The Events schema validates endTime to 00:00–23:59, but this builder also
    // serves imported/legacy rows that skipped it. Guard the range: an
    // out-of-range value would make `start.with(...)` throw, and because the
    // throw propagates past the send's best-effort boundary it would suppress
    // the *whole* confirmation email, not just the attachment.
    if (hour <= 23 && minute <= 59) {
      const candidate = start.with({ hour, minute, second: 0 })
      // A wall-clock end at or before the start is data we can't interpret as
      // same-day; fall back rather than emit a negative-length event.
      if (Temporal.ZonedDateTime.compare(candidate, start) > 0) return candidate
    }
  }
  return start.add({ minutes: DEFAULT_DURATION_MINUTES })
}

/**
 * Build the `VCALENDAR` document for an event, or `null` when the schedule has
 * no usable `firstDate` (the one case `buildRRuleTemporal` cannot resolve).
 */
export function buildEventCalendar(input: EventCalendarInput): string | null {
  // Safe per `EventScheduleInput` — the two shapes differ only in null vs
  // undefined, which every read in buildRRuleTemporal treats identically.
  const schedule = input.schedule as Partial<ScheduleSubFields>

  const rule = buildRRuleTemporal(schedule)
  if (!rule) return null

  const options = rule.options()
  const start = options.dtstart
  const timezone = options.tzid || 'UTC'
  const isRecurring = Boolean(schedule.recurrenceType)

  const calendar = ical({
    // ical-generator escapes the VEVENT TEXT fields (SUMMARY / LOCATION /
    // DESCRIPTION) per RFC 5545, but NOT the calendar-level `name`
    // (`NAME` / `X-WR-CALNAME`). A title with a raw CR/LF would therefore inject
    // real calendar lines — e.g. a `BEGIN:VALARM` component — so strip line
    // breaks here, at the one unescaped sink.
    name: stripNewlines(input.title),
    prodId: '//Sahaj Cloud//Events//EN',
    // Supplies the VTIMEZONE component for whichever TZID the events reference.
    timezone: { name: timezone, generator: getVtimezoneComponent },
  })

  const event = calendar.createEvent({
    start,
    end: resolveEnd(start, schedule.endTime),
    timezone,
    summary: input.title,
    ...(input.location && { location: input.location }),
    ...(input.description && { description: input.description }),
    ...(input.url && { url: input.url }),
    ...(input.uid && { id: input.uid }),
  })

  // A one-off event is modelled internally as FREQ=DAILY;COUNT=1 so that
  // timezone handling is shared — but emitting that RRULE would make a single
  // class look like a series in the client. Leave it as a plain VEVENT.
  if (isRecurring) {
    event.repeating({
      freq: options.freq as ICalEventRepeatingFreq,
      ...(options.interval && options.interval > 1 && { interval: options.interval }),
      ...(options.byDay?.length && splitByDay(options.byDay)),
      ...(options.byMonthDay?.length && { byMonthDay: options.byMonthDay }),
      ...(options.count && { count: options.count }),
      ...(options.until && { until: options.until }),
      ...(options.exDate?.length && { exclude: options.exDate }),
    })
  }

  return calendar.toString()
}
