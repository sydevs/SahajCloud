import type { Endpoint } from 'payload'

import { isPublished } from '@/fields/publicUrlFields'
import { addressOneLine } from '@/lib/notifications/eventDetails'
import { lexicalToPlainText } from '@/lib/richEditor/lexicalToPlainText'
import { buildEventCalendar, ICalEventStatus } from '@/lib/schedule/icsBuilder'
import { shouldFinish } from '@/lib/schedule/scheduleStatus'
import type { Event } from '@/payload-types'
import { publicReadCacheHeaders } from '@/plugins/cache'

import { readEventCalendarToken } from '../calendarToken'

/** How long a withdrawn class keeps answering, so subscribers clear it themselves. */
const CANCELLED_WINDOW_DAYS = 90

/** Re-fetch hint, in seconds. A hint only — see `EventCalendarInput.ttl`. */
const REFRESH_SECONDS = 60 * 60

/**
 * Where `SEQUENCE` counts from. Seconds since this date keeps the number small
 * enough for a client that holds a revision in 32 bits, for the next few decades.
 */
const SEQUENCE_EPOCH_MS = Date.UTC(2026, 0, 1)

/**
 * The document's revision: whole seconds of `updatedAt`, and one more for a
 * cancellation.
 *
 * ⚠ **A client ignores a revision that is not strictly higher than the one it
 * holds**, and both directions have to work: a withdrawal must outrank the live
 * document it replaces, and a later republish must outrank that withdrawal. Two
 * fixed numbers only did the first, so an automatic unpublish on a verification
 * lapse followed by a republish left every subscriber holding the cancellation
 * for good. Each of those transitions is a write, so `updatedAt` is the monotonic
 * counter nothing here has to store, and the `+1` covers the withdrawal landing in
 * the same second as the state it replaces.
 *
 * shortcut: whole seconds, because milliseconds since any useful epoch overflow
 * the 32 bits a client may hold a revision in. Two state changes inside two
 * seconds of each other can therefore tie. Move to a stored counter if a writer
 * ever appears that can make them that fast.
 */
function revisionOf(updatedAt: string | null | undefined, cancelled: boolean): number {
  const at = updatedAt ? new Date(updatedAt).getTime() : NaN
  const seconds = Number.isNaN(at) ? 0 : Math.max(0, Math.floor((at - SEQUENCE_EPOCH_MS) / 1000))
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

/** `LOCATION` for an in-person class; nothing for an online one — see the handler docblock. */
function feedLocation(event: Event): string | null {
  if (event.eventType === 'online') return null
  const line = addressOneLine(event.address ?? {})
  return line === '' ? null : line
}

/**
 * The description — for an in-person class only.
 *
 * ⚠ **An online class ships none.** The text is organiser-authored free text and
 * the feed is readable by anyone holding the address, so the only reliable way to
 * keep a joining link out of it is not to send it. Matching the stored `onlineUrl`
 * against the text is not reliable: a trailing slash or an extra query parameter
 * makes the two differ while both still open the room.
 */
function feedDescription(event: Event): string | null {
  if (event.eventType === 'online') return null
  const text = lexicalToPlainText(event.description)
  return text === '' ? null : text
}

/** Milliseconds since a timestamp, or `null` when it is missing or unparseable. */
function ageMs(value: string | null | undefined, now: number): number | null {
  if (!value) return null
  const at = new Date(value).getTime()
  return Number.isNaN(at) ? null : now - at
}

/**
 * GET /api/events/calendar/:file — one class as a subscribable iCalendar feed.
 *
 * ⚠ **No `requireActiveClient`, and no hand-rolled substitute.** A calendar
 * server (Apple, Google, Microsoft) fetches this on the subscriber's behalf,
 * server-side: no API key, no `Origin`, no `Referer`. The signed token in the
 * path is therefore the entire access control, and the guard is skipped rather
 * than failed. Three consequences follow, and each is accepted here:
 *
 * - **No origin enforcement.** Nothing bounds which site a subscription came
 *   from, because no request carries that fact.
 * - **No rejected-credential signal.** `requireActiveClient` is what reports a
 *   presented-and-rejected API key (`docs/rules/endpoints.md`); a probed token
 *   is silent.
 * - **No usage count.** `countClientRead` returns unless the caller is a
 *   `clients` user (`src/plugins/usage/hooks.ts`), so these fetches appear in no
 *   site's figures. sydevs/SahajCloud#1015 owns that number.
 *
 * ⚠ **`overrideAccess` drops every `Where` the collection would have applied**
 * ("A permission is not a row"), so the visibility rules are applied here: a
 * published, unfinished class answers its live feed, one withdrawn within
 * {@link CANCELLED_WINDOW_DAYS} days answers a `STATUS:CANCELLED` document so
 * subscribers clear it, and everything else is a 404. The token is a grant over
 * exactly one row id, which is what makes reading that row directly safe.
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

    const now = Date.now()
    const live = isPublished(event._status, req.locale) && event.deletedAt == null
    // ⚠ An unpublished class has no takedown timestamp of its own, so the window
    // runs from `updatedAt` — which any later write restarts. The effect is that a
    // class somebody keeps editing while unpublished keeps answering CANCELLED past
    // 90 days, which is the harmless direction: it tells subscribers to drop a
    // class that is in fact down.
    const withdrawnAge = ageMs(event.deletedAt ?? event.updatedAt, now)

    if (!live) {
      // Outside the window the class is gone for good: every subscriber has had
      // 90 days of cancelled answers to clear it.
      if (withdrawnAge == null || withdrawnAge > CANCELLED_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
        return notFound()
      }
    } else if (event.inactive || shouldFinish(event, new Date(now))) {
      // A dormant class has no sessions to subscribe to, and a finished one has
      // none left to cancel — the public feeds have already dropped it. The
      // `inactive` check is its own, rather than left to the builder answering
      // null: a dormant row can still carry a stale `schedule.firstDate`, which
      // would otherwise serve a class that is not running.
      return notFound()
    }

    const document = buildEventCalendar({
      title: event.title,
      schedule: event.schedule ?? {},
      // A stable UID, or ical-generator mints a fresh one per response and the
      // entry is re-created on every refresh.
      uid: `event-${event.id}@cloud.sydevelopers.com`,
      ttl: REFRESH_SECONDS,
      lastModified: event.deletedAt ?? event.updatedAt,
      sequence: revisionOf(event.updatedAt, !live),
      ...(live
        ? {
            location: feedLocation(event),
            description: feedDescription(event),
            url: event.webUrl,
          }
        : { status: ICalEventStatus.CANCELLED }),
    })
    // The one case the builder refuses on its own: a schedule with no usable
    // `firstDate`.
    if (document === null) return notFound()

    return new Response(document, {
      headers: {
        ...publicReadCacheHeaders(req, ['events']),
        'Content-Type': 'text/calendar; charset=utf-8',
      },
    })
  },
}
