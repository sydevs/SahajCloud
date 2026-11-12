/**
 * `GET /api/events/calendar/:token.ics` — one class as a subscribable calendar feed, plus the
 * virtual `calendarFeedUrl` that hands the widget its address.
 *
 * The feed is unauthenticated by construction: Apple, Google and Microsoft fetch it server-side
 * with no credential, so the signed token in the path is the whole access control. That makes
 * three properties worth more than the happy path, and most of this file is about them — a
 * refusal never says which check failed, a withdrawn class keeps answering for 90 days and then
 * stops, and no response carries an online class's joining link.
 */
import type { Payload } from 'payload'

import { sql } from '@payloadcms/db-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { signEventCalendarToken } from '@/collections/Events/calendarToken'
import { signUnsubscribeToken } from '@/lib/registrations/unsubscribeToken'

import { createAnonRestClient, type RestClient } from '../utils/restRequest'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const JOIN_URL = 'https://meet.example.com/private-room-7f3a'
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * A weekly class that never ends, so it can never read as finished. Each fixture takes its own
 * hour: `refuseDuplicateClass` turns away a second class sharing a region, place, start time and
 * schedule.
 */
const weekly = (hour: number) => ({
  firstDate: `2026-07-21T${String(hour).padStart(2, '0')}:00:00.000Z`,
  firstDate_tz: 'Europe/London',
  recurrenceType: 'WEEKLY',
  weekdays: ['TU'],
})

/** The VEVENT block alone — VTIMEZONE carries an `X-LIC-LOCATION` of its own. */
const vevent = (ics: string) => ics.slice(ics.indexOf('BEGIN:VEVENT'), ics.indexOf('END:VEVENT'))

/** A VEVENT property's value, or undefined when it declares none. */
const property = (ics: string, name: string) =>
  vevent(ics)
    .split('\r\n')
    .find((eachLine) => eachLine.startsWith(`${name}:`))
    ?.slice(name.length + 1)

/**
 * A signature with one character changed, in bits every decoder reads. It has to be the
 * first: base64url's last character of a 256-bit signature carries two bits no byte
 * decodes, so changing that one leaves a token in sixteen byte-identical and authentic.
 */
const tamper = (signature: string) =>
  `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`

/** Whether the VEVENT declares a property, matched at the start of its own line. */
const hasProperty = (ics: string, property: string) =>
  vevent(ics)
    .split('\r\n')
    .some((eachLine) => eachLine.startsWith(`${property}:`))

describe('event calendar feed', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let anon: RestClient
  let secret: string
  let managerId: number
  let regionId: number

  const feedPath = async (eventId: number) =>
    `/api/events/calendar/${await signEventCalendarToken({ eventId }, secret)}.ics`

  const createClass = async (overrides: Record<string, unknown>) =>
    testData.createEvent(payload, {
      inactive: false,
      manager: managerId,
      region: regionId,
      _status: 'published',
      ...overrides,
    } as never)

  /**
   * Moves a row's `updated_at` back. Payload owns that column, and it is what dates an
   * *unpublished* class's 90-day window, so nothing reachable through the API can age one.
   */
  const backdateUpdatedAt = async (eventId: number, days: number) => {
    const schema = payload.db.schemaName
    const table = schema ? `"${schema}"."events"` : '"events"'
    await payload.db.drizzle.execute(
      sql.raw(
        `UPDATE ${table} SET updated_at = now() - interval '${days} days' WHERE id = ${eventId}`,
      ),
    )
  }

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    anon = createAnonRestClient(testEnv)
    secret = payload.secret

    managerId = (await testData.createManager(payload)).id
    regionId = (await testData.createRegion(payload)).id
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('a published, unfinished class', () => {
    let eventId: number

    beforeAll(async () => {
      const event = await createClass({
        title: 'Thornbury Meditation',
        eventType: 'offline',
        address: {
          street: '12 Example Street',
          city: 'Bristol',
          country: 'United Kingdom',
          latitude: 51.45,
          longitude: -2.58,
        },
        schedule: weekly(8),
      })
      eventId = event.id
    })

    it('answers the calendar document, with its recurrence and a stable UID', async () => {
      const response = await anon(await feedPath(eventId))

      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8')
      expect(response.raw).toContain('BEGIN:VCALENDAR')
      expect(response.raw).toContain(`UID:event-${eventId}@cloud.sydevelopers.com`)
      expect(response.raw).toContain('RRULE:FREQ=WEEKLY;BYDAY=TU')
      // The VTIMEZONE component Apple needs to hold the local hour over a DST change.
      expect(response.raw).toContain('BEGIN:VTIMEZONE')
      expect(response.raw).toContain('TZID:Europe/London')
    })

    it('carries the refresh hints, a sequence and a last-modified', async () => {
      const raw = (await anon(await feedPath(eventId))).raw

      expect(raw).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT1H')
      expect(raw).toContain('X-PUBLISHED-TTL:PT1H')
      expect(Number(property(raw, 'SEQUENCE'))).toBeGreaterThan(0)
      expect(raw).toContain('LAST-MODIFIED:')
    })

    it('carries the venue as LOCATION', async () => {
      expect((await anon(await feedPath(eventId))).raw).toContain('12 Example Street')
    })

    // The online rule below withholds the description. An in-person class keeps it,
    // or that rule would read as "the feed never carries one".
    it('carries an in-person class description', async () => {
      const described = await createClass({
        title: 'Described Class',
        eventType: 'offline',
        address: {
          street: '9 Other Street',
          city: 'Bath',
          country: 'United Kingdom',
          latitude: 51.38,
          longitude: -2.36,
        },
        schedule: weekly(16),
        description: {
          root: {
            type: 'root',
            format: '',
            indent: 0,
            version: 1,
            direction: 'ltr',
            children: [
              {
                type: 'paragraph',
                format: '',
                indent: 0,
                version: 1,
                direction: 'ltr',
                children: [
                  {
                    type: 'text',
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'Bring a cushion.',
                    version: 1,
                  },
                ],
              },
            ],
          },
        },
      })

      expect((await anon(await feedPath(described.id))).raw).toContain('Bring a cushion.')
    })

    // A subscribed feed is a read of `events`, so a write to any class must be able to
    // evict it from the edge.
    it('is edge-cacheable and tagged with the collection', async () => {
      const response = await anon(await feedPath(eventId))

      expect(response.headers.get('Cache-Tag')).toBe('events')
      expect(response.headers.get('Cache-Control')).toContain('s-maxage=')
    })

    // No status may differ from any other, or the response describes which check refused.
    it('refuses an unknown, tampered, malformed or wrong-kind token identically', async () => {
      const good = await anon(await feedPath(eventId))
      const [header, claims, signature] = (await signEventCalendarToken({ eventId }, secret)).split(
        '.',
      )

      const refusals = await Promise.all([
        // A class that never existed.
        anon(await feedPath(eventId + 10_000)),
        // One character of the signature changed.
        anon(`/api/events/calendar/${header}.${claims}.${tamper(signature!)}.ics`),
        // Not a token at all.
        anon('/api/events/calendar/not-a-token.ics'),
        // Authentic, signed with the same secret, minted for another link type.
        anon(
          `/api/events/calendar/${await signUnsubscribeToken({ submissionId: eventId }, secret)}.ics`,
        ),
      ])

      for (const refusal of refusals) {
        expect(refusal.status).toBe(404)
        expect(refusal.body).toEqual(refusals[0]!.body)
      }
      expect(good.status).toBe(200)
    })

    it('refuses a path that does not end .ics', async () => {
      const token = await signEventCalendarToken({ eventId }, secret)

      expect((await anon(`/api/events/calendar/${token}`)).status).toBe(404)
      expect((await anon(`/api/events/calendar/${token}.txt`)).status).toBe(404)
    })
  })

  describe('an online class', () => {
    let eventId: number

    beforeAll(async () => {
      const event = await createClass({
        title: 'Online Meditation',
        eventType: 'online',
        onlineUrl: JOIN_URL,
        schedule: weekly(9),
      })
      eventId = event.id
    })

    /**
     * The address is a credential anyone can be handed, so the joining link must not ride
     * along in any field — the confirmation email's attachment is where it still belongs.
     */
    it('never carries the joining link, in LOCATION, DESCRIPTION or URL', async () => {
      const response = await anon(await feedPath(eventId))

      expect(response.status).toBe(200)
      expect(response.raw).not.toContain(JOIN_URL)
      expect(response.raw).not.toContain('meet.example.com')
      expect(hasProperty(response.raw, 'LOCATION')).toBe(false)
      expect(hasProperty(response.raw, 'DESCRIPTION')).toBe(false)
    })

    /**
     * Matching the stored `onlineUrl` against the text cannot be relied on — a trailing
     * slash or an extra query parameter differs while both still open the room — so an
     * online class ships no description at all, whatever it says.
     */
    it('ships no description for an online class, link in the text or not', async () => {
      const withLink = await createClass({
        title: 'Online With Link In Text',
        eventType: 'online',
        // Stored with a trailing slash, written without one. Both open the room, and
        // neither contains the other — which is what the substring guard this
        // replaced could not see.
        onlineUrl: `${JOIN_URL}/`,
        schedule: weekly(10),
        description: {
          root: {
            type: 'root',
            format: '',
            indent: 0,
            version: 1,
            direction: 'ltr',
            children: [
              {
                type: 'paragraph',
                format: '',
                indent: 0,
                version: 1,
                direction: 'ltr',
                children: [
                  {
                    type: 'text',
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: `Join at ${JOIN_URL}`,
                    version: 1,
                  },
                ],
              },
            ],
          },
        },
      })

      const raw = (await anon(await feedPath(withLink.id))).raw
      expect(raw).not.toContain(JOIN_URL)
      expect(raw).not.toContain('meet.example.com')
      expect(hasProperty(raw, 'DESCRIPTION')).toBe(false)
    })
  })

  describe('a class that has finished', () => {
    it('answers 404 — nothing is left to cancel', async () => {
      // A one-off five years back.
      const finished = await createClass({
        title: 'Finished Class',
        eventType: 'online',
        onlineUrl: 'https://example.com/finished',
        schedule: { firstDate: '2021-04-01T10:00:00.000Z', firstDate_tz: 'Europe/London' },
      })

      expect((await anon(await feedPath(finished.id))).status).toBe(404)
    })
  })

  describe('a dormant class', () => {
    /**
     * `shouldFinish` exempts an `inactive` class, and such a row can still carry a stale
     * `firstDate` from before it was switched off — so leaving this to the builder
     * answering null would serve sessions of a class that is not running.
     */
    it('answers 404 even while it carries a schedule', async () => {
      const dormant = await createClass({
        title: 'Dormant With Schedule',
        inactive: true,
        eventType: 'online',
        onlineUrl: 'https://example.com/dormant',
        schedule: weekly(17),
      })

      expect((await anon(await feedPath(dormant.id))).status).toBe(404)
    })
  })

  describe('a class taken down', () => {
    it('answers a cancellation that outranks the live feed, for an unpublished class', async () => {
      const event = await createClass({
        title: 'Unpublished Class',
        eventType: 'online',
        onlineUrl: JOIN_URL,
        schedule: weekly(11),
      })
      const liveRevision = Number(property((await anon(await feedPath(event.id))).raw, 'SEQUENCE'))

      await payload.update({ collection: 'events', id: event.id, data: { _status: 'draft' } })
      const cancelled = await anon(await feedPath(event.id))

      expect(cancelled.status).toBe(200)
      expect(cancelled.raw).toContain(`UID:event-${event.id}@cloud.sydevelopers.com`)
      expect(cancelled.raw).toContain('STATUS:CANCELLED')
      // Strictly higher, or a subscribed client ignores the revision and keeps the class.
      expect(Number(property(cancelled.raw, 'SEQUENCE'))).toBeGreaterThan(liveRevision)
      expect(cancelled.raw).not.toContain(JOIN_URL)
    })

    /**
     * The other direction, which two fixed sequence numbers could not express.
     * ExpireEvents unpublishes a class on its own when verification lapses, so a
     * republish that every subscriber ignored would leave the class cancelled for good.
     */
    it('outranks its own cancellation again when the class is republished', async () => {
      const event = await createClass({
        title: 'Republished Class',
        eventType: 'online',
        onlineUrl: 'https://example.com/republished',
        schedule: weekly(15),
      })
      await payload.update({ collection: 'events', id: event.id, data: { _status: 'draft' } })
      // The lapse was ten days ago, which is the shape this is about — and it makes the
      // comparison deterministic, since whole seconds would tie inside one test tick.
      await backdateUpdatedAt(event.id, 10)
      const cancelled = Number(property((await anon(await feedPath(event.id))).raw, 'SEQUENCE'))

      await payload.update({ collection: 'events', id: event.id, data: { _status: 'published' } })
      const republished = await anon(await feedPath(event.id))

      expect(republished.raw).not.toContain('STATUS:CANCELLED')
      expect(Number(property(republished.raw, 'SEQUENCE'))).toBeGreaterThan(cancelled)
    })

    it('stops answering more than 90 days after it was unpublished', async () => {
      const event = await createClass({
        title: 'Long Unpublished Class',
        eventType: 'online',
        onlineUrl: 'https://example.com/long-gone',
        schedule: weekly(12),
      })
      await payload.update({ collection: 'events', id: event.id, data: { _status: 'draft' } })

      await backdateUpdatedAt(event.id, 89)
      expect((await anon(await feedPath(event.id))).status).toBe(200)

      await backdateUpdatedAt(event.id, 91)
      expect((await anon(await feedPath(event.id))).status).toBe(404)
    })

    it('answers a cancellation for a trashed class, and stops after 90 days', async () => {
      const event = await createClass({
        title: 'Trashed Class',
        eventType: 'online',
        onlineUrl: 'https://example.com/trashed',
        schedule: weekly(13),
      })

      // The nightly sweep withdraws a class exactly this way, rather than deleting it.
      const trash = (deletedAt: string) =>
        payload.update({ collection: 'events', id: event.id, data: { deletedAt }, trash: true })

      await trash(new Date(Date.now() - 2 * DAY_MS).toISOString())
      const inside = await anon(await feedPath(event.id))
      expect(inside.status).toBe(200)
      expect(inside.raw).toContain('STATUS:CANCELLED')

      await trash(new Date(Date.now() - 91 * DAY_MS).toISOString())
      expect((await anon(await feedPath(event.id))).status).toBe(404)
    })
  })

  describe('calendarFeedUrl', () => {
    let eventId: number

    beforeAll(async () => {
      const event = await createClass({
        title: 'Addressed Class',
        eventType: 'online',
        onlineUrl: 'https://example.com/addressed',
        schedule: weekly(14),
        registrationMode: 'sahaj-atlas',
      })
      eventId = event.id
    })

    it('carries an address a single-document read can actually fetch', async () => {
      const doc = await payload.findByID({
        collection: 'events',
        id: eventId,
        select: { calendarFeedUrl: true },
      })

      expect(doc.calendarFeedUrl).toMatch(/^https?:\/\/.+\/api\/events\/calendar\/.+\.ics$/)
      const path = new URL(doc.calendarFeedUrl!).pathname
      expect((await anon(path)).status).toBe(200)
    })

    // Signing one per row would hand the class's calendar address to every reader of a
    // list, a map feed, or a registration row.
    it('is null on a list read', async () => {
      const list = await payload.find({
        collection: 'events',
        where: { id: { equals: eventId } },
        select: { calendarFeedUrl: true },
      })

      expect(list.docs[0]?.calendarFeedUrl).toBeNull()
    })

    it('is absent from an event hydrated through a relationship', async () => {
      const submission = await payload.create({
        collection: 'user-submissions',
        data: {
          type: 'registration',
          status: 'accepted',
          event: eventId,
          senderEmail: 'feed-reader@example.invalid',
          submissionData: [{ field: 'name', value: 'Feed Reader' }],
        } as never,
        overrideAccess: true,
      })

      const hydrated = await payload.findByID({
        collection: 'user-submissions',
        id: submission.id,
        depth: 1,
      })
      const event = hydrated.event
      expect(typeof event === 'object' && event !== null && 'calendarFeedUrl' in event).toBe(false)
    })

    /**
     * A finished class stays published on purpose (#603), so without this the widget
     * would render a subscribe row over an address the feed answers 404 for.
     */
    it('is null for a published class whose schedule has run out', async () => {
      const finished = await createClass({
        title: 'Finished Addressed Class',
        eventType: 'online',
        onlineUrl: 'https://example.com/finished-addressed',
        schedule: { firstDate: '2021-04-01T10:00:00Z', firstDate_tz: 'Europe/London' },
      })

      const doc = await payload.findByID({
        collection: 'events',
        id: finished.id,
        select: { calendarFeedUrl: true },
      })
      expect(doc.calendarFeedUrl).toBeNull()
    })

    it('is null for a class with no resolvable schedule', async () => {
      const dormant = await testData.createEvent(payload, {
        title: 'Dormant Class',
        manager: managerId,
        region: regionId,
        _status: 'published',
      } as never)

      const doc = await payload.findByID({
        collection: 'events',
        id: dormant.id,
        select: { calendarFeedUrl: true },
      })
      expect(doc.calendarFeedUrl).toBeNull()
    })

    /**
     * The feed answers a withdrawn class a cancellation, never its sessions, so an
     * address here would be a menu row offering a class that is down.
     */
    it('is null for a trashed class the feed still answers', async () => {
      const trashed = await createClass({
        title: 'Trashed Addressed Class',
        eventType: 'online',
        onlineUrl: 'https://example.com/trashed-addressed',
        schedule: weekly(18),
      })
      await payload.update({
        collection: 'events',
        id: trashed.id,
        data: { deletedAt: new Date(Date.now() - 2 * DAY_MS).toISOString() },
        trash: true,
      })

      const feed = await anon(await feedPath(trashed.id))
      expect(feed.status).toBe(200)
      expect(feed.raw).toContain('STATUS:CANCELLED')

      const doc = await payload.findByID({
        collection: 'events',
        id: trashed.id,
        select: { calendarFeedUrl: true },
        trash: true,
      })
      expect(doc.calendarFeedUrl).toBeNull()
    })

    it('is null for an unpublished class', async () => {
      await payload.update({ collection: 'events', id: eventId, data: { _status: 'draft' } })

      const doc = await payload.findByID({
        collection: 'events',
        id: eventId,
        select: { calendarFeedUrl: true },
      })
      expect(doc.calendarFeedUrl).toBeNull()
    })
  })
})
