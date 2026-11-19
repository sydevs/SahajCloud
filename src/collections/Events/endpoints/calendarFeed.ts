import type { Endpoint } from 'payload'

import { isPublished } from '@/fields/publicUrlFields'
import { addressOneLine } from '@/lib/notifications/eventDetails'
import { lexicalToPlainText } from '@/lib/richEditor/lexicalToPlainText'
import type { EventCalendarInput } from '@/lib/schedule/icsBuilder'
import { buildEventCalendar, ICalEventStatus } from '@/lib/schedule/icsBuilder'
import { buildRRuleTemporal } from '@/lib/schedule/scheduleHooks'
import { shouldFinish } from '@/lib/schedule/scheduleStatus'
import type { Event } from '@/payload-types'
import { publicReadCacheHeaders } from '@/plugins/cache'
import type { EventSchedule } from '@/types/schedule'

import { readEventCalendarToken } from '../calendarToken'

/** How long a withdrawn class keeps answering, so subscribers clear it themselves. */
const CANCELLED_WINDOW_DAYS = 90
const CANCELLED_WINDOW_MS = CANCELLED_WINDOW_DAYS * 24 * 60 * 60 * 1000

/** Re-fetch hint, in seconds. A hint only — see `EventCalendarInput.ttl`. */
const REFRESH_SECONDS = 60 * 60

/**
 * Where `SEQUENCE` counts from. Seconds since this date keep the number inside
 * the 32 bits a client may hold a revision in, for the next few decades.
 */
const SEQUENCE_EPOCH_MS = Date.UTC(2026, 0, 1)

/** A stored timestamp as epoch milliseconds, or `null` when absent or unparseable. */
function epochMs(value: string | null | undefined): number | null {
  const at = value ? new Date(value).getTime() : NaN
  return Number.isNaN(at) ? null : at
}

/**
 * The document's revision: whole seconds of `updatedAt`, plus one for a cancellation.
 *
 * ⚠ **A client ignores a revision that is not strictly higher than the one it
 * holds**, and both directions have to work. Two fixed numbers only made a
 * withdrawal outrank the live document, so an automatic unpublish followed by a
 * republish left every subscriber holding the cancellation for good. Every such
 * transition is a write, so `updatedAt` is the monotonic counter nothing here
 * has to store, and the `+1` covers a withdrawal landing in the same second as
 * the state it replaces.
 *
 * shortcut: whole seconds, because milliseconds since any useful epoch overflow
 * the 32 bits a client may hold a revision in, so two state changes inside two
 * seconds can tie. Move to a stored counter if a writer that fast appears.
 */
function revisionOf(updatedAt: string | null | undefined, cancelled: boolean): number {
  const at = epochMs(updatedAt)
  const seconds = at == null ? 0 : Math.max(0, Math.floor((at - SEQUENCE_EPOCH_MS) / 1000))
  return cancelled ? seconds + 1 : seconds
}

/** The fields the feed reads. `webUrl` is virtual; its own inputs are restored by the plugin. */
const FEED_SELECT = {
  _status: true,
  address: true,
  deletedAt: true,
  description: true,
  eventType: true,
  inactive: true,
  schedule: true,
  title: true,
  updatedAt: true,
  webUrl: true,
} as const

/**
 * The one 404. Every refusal shares this body so the response cannot describe
 * which check failed — an unknown id and a tampered signature read alike.
 */
const notFound = (): Response =>
  Response.json({ errors: [{ message: 'Not found.' }] }, { status: 404 })

/**
 * What a live class carries beyond its schedule; the builder drops any that is empty.
 *
 * ⚠ **An online class ships no description, and has no address to place.** The
 * text is organiser-authored and anyone holding the feed address can read it, so
 * the only reliable way to keep a joining link out is not to send one — matching
 * the stored `onlineUrl` against the text differs on a trailing slash or an extra
 * query parameter while both still open the room.
 */
function liveDetails(event: Event): Pick<EventCalendarInput, 'description' | 'location' | 'url'> {
  if (event.eventType === 'online') return { url: event.webUrl }
  return {
    location: addressOneLine(event.address ?? {}),
    description: lexicalToPlainText(event.description),
    url: event.webUrl,
  }
}

/**
 * Whether the schedule yields a recurrence, which every answer needs a document from.
 *
 * ⚠ **A throw is an unresolvable schedule, not an error to surface.**
 * `buildRRuleTemporal` leaves its `until` parse and the rule construction outside
 * its own try, and this runs on an ordinary `events` document read, where a 500
 * would replace a class that simply has no feed.
 */
function hasRecurrence(schedule: Partial<EventSchedule> | null | undefined): boolean {
  try {
    return buildRRuleTemporal(schedule ?? {}) != null
  } catch {
    return false
  }
}

/** What the feed has to say about a class. */
export type CalendarFeedAnswer = 'live' | 'cancelled' | 'none'

/** What {@link calendarFeedAnswer} reads. A field hook is handed a partial document. */
export interface CalendarFeedSubject {
  _status?: unknown
  deletedAt?: string | null
  inactive?: boolean | null
  schedule?: Partial<EventSchedule> | null
  updatedAt?: string | null
}

/**
 * The one rule deciding what this feed answers.
 *
 * ⚠ **`Events.calendarFeedUrl` hands out this feed's address, so it reads this
 * rule too** and withholds an address for anything but `live`. Written once
 * here: two spellings let the field advertise a class the feed refuses, and no
 * spec would fail.
 */
export function calendarFeedAnswer(
  event: CalendarFeedSubject,
  locale: string | undefined,
  now: Date,
): CalendarFeedAnswer {
  // Every answer, a cancellation included, is built from a recurrence.
  if (!hasRecurrence(event.schedule)) return 'none'

  if (!isPublished(event._status, locale) || event.deletedAt != null) {
    // ⚠ An unpublished class has no takedown timestamp of its own, so the window
    // runs from `updatedAt`, which any later write restarts. A class someone keeps
    // editing while unpublished therefore answers CANCELLED past 90 days — the
    // harmless direction, since it tells subscribers to drop a class that is in
    // fact down. Past the window every subscriber has had 90 days to clear it.
    const withdrawnAt = epochMs(event.deletedAt ?? event.updatedAt)
    if (withdrawnAt == null || now.getTime() - withdrawnAt > CANCELLED_WINDOW_MS) return 'none'
    return 'cancelled'
  }

  // A dormant class has no sessions to subscribe to, and a finished one none left
  // to cancel — the public feeds have already dropped it. `inactive` is checked
  // rather than left to the recurrence failing to resolve: a dormant row can
  // still carry a stale `schedule.firstDate`.
  if (event.inactive || shouldFinish(event, now)) return 'none'
  return 'live'
}

/**
 * GET /api/events/calendar/:file — one class as a subscribable iCalendar feed.
 *
 * ⚠ **No `requireActiveClient`, and no hand-rolled substitute.** A calendar
 * server (Apple, Google, Microsoft) fetches this on the subscriber's behalf:
 * no API key, no `Origin`, no `Referer`. The signed token in the path is the
 * entire access control, so the guard is skipped rather than failed, and three
 * consequences are accepted. Nothing bounds which site a subscription came from.
 * A probed token raises no rejected-credential signal, which only
 * `requireActiveClient` reports (`docs/rules/endpoints.md`). And these fetches
 * reach no site's usage figures, since `countClientRead` counts `clients` users
 * alone (`src/plugins/usage/hooks.ts`) — sydevs/SahajCloud#1015 owns that number.
 *
 * ⚠ **`overrideAccess` drops every `Where` the collection would have applied**
 * ("A permission is not a row"), so {@link calendarFeedAnswer} applies the
 * visibility rules instead. The token is a grant over exactly one row id, which
 * is what makes reading that row directly safe.
 */
export const eventCalendarFeed: Endpoint = {
  // `:file`, not `:token.ics` — the handler splits the extension itself rather
  // than depending on how Payload's matcher treats a dotted parameter suffix.
  path: '/calendar/:file',
  method: 'get',
  handler: async (req) => {
    const file = req.routeParams?.file
    if (typeof file !== 'string' || !file.endsWith('.ics')) return notFound()

    const verified = await readEventCalendarToken(file.slice(0, -'.ics'.length), req.payload.secret)
    if (verified.status !== 'valid') return notFound()

    const event = (await req.payload.findByID({
      collection: 'events',
      id: verified.claims.eventId,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      select: FEED_SELECT,
      // The nightly sweep withdraws a class by setting `deletedAt` rather than
      // deleting it, and that row is exactly what the cancelled feed answers from.
      trash: true,
    })) as Event | null
    if (!event) return notFound()

    const answer = calendarFeedAnswer(event, req.locale, new Date())
    if (answer === 'none') return notFound()

    const document = buildEventCalendar({
      title: event.title,
      schedule: event.schedule ?? {},
      // A stable UID, or ical-generator mints a fresh one per response and the
      // entry is re-created on every refresh.
      uid: `event-${event.id}@cloud.sydevelopers.com`,
      ttl: REFRESH_SECONDS,
      lastModified: event.deletedAt ?? event.updatedAt,
      sequence: revisionOf(event.updatedAt, answer === 'cancelled'),
      ...(answer === 'live' ? liveDetails(event) : { status: ICalEventStatus.CANCELLED }),
    })
    // Unreachable: the answer above required a resolvable recurrence, which is the
    // one thing the builder refuses. Kept because its signature still admits null.
    if (document === null) return notFound()

    return new Response(document, {
      headers: {
        ...publicReadCacheHeaders(req, ['events']),
        'Content-Type': 'text/calendar; charset=utf-8',
      },
    })
  },
}
