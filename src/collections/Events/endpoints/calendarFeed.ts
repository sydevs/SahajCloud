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

// A client ignores a revision that is not strictly higher than the one it holds,
// so the cancellation has to outrank the live document it replaces. Two fixed
// numbers rather than a counter: nothing stores a revision, and an edit that
// changes the schedule changes the recurrence a client already re-reads.
const LIVE_SEQUENCE = 0
const CANCELLED_SEQUENCE = 1

/** The fields the feed reads. `webUrl` is virtual; its own inputs are restored by the plugin. */
const FEED_SELECT = {
  _status: true,
  address: true,
  deletedAt: true,
  description: true,
  eventType: true,
  inactive: true,
  onlineUrl: true,
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
 * The description, less anything that would smuggle the joining link out.
 *
 * The text is organiser-authored free text, and the feed is world-readable to
 * whoever holds the address, so a class whose description repeats its own join
 * URL ships no description at all rather than a half-redacted one.
 */
function feedDescription(event: Event): string | null {
  const text = lexicalToPlainText(event.description)
  if (text === '') return null
  const joinUrl = event.onlineUrl?.trim()
  if (joinUrl && text.includes(joinUrl)) return null
  return text
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
    const withdrawnAge = ageMs(event.deletedAt ?? event.updatedAt, now)

    if (!live) {
      // Outside the window the class is gone for good: every subscriber has had
      // 90 days of cancelled answers to clear it.
      if (withdrawnAge == null || withdrawnAge > CANCELLED_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
        return notFound()
      }
    } else if (shouldFinish(event, new Date(now))) {
      // A finished class has no sessions left to cancel, and the public feeds
      // have already dropped it.
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
      ...(live
        ? {
            location: feedLocation(event),
            description: feedDescription(event),
            url: event.webUrl,
            sequence: LIVE_SEQUENCE,
          }
        : { status: ICalEventStatus.CANCELLED, sequence: CANCELLED_SEQUENCE }),
    })
    // An `inactive` class carries no resolvable schedule, so the builder answers
    // null and there is nothing to serve.
    if (document === null) return notFound()

    return new Response(document, {
      headers: {
        ...publicReadCacheHeaders(req, ['events']),
        'Content-Type': 'text/calendar; charset=utf-8',
      },
    })
  },
}
