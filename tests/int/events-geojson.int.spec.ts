import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { eventsGeoJson } from '@/collections/Events/endpoints/geojson'
import type { EventFeature } from '@/collections/Events/endpoints/responseTypes'
import { serverEnv } from '@/lib/env'
import type { Event } from '@/payload-types'

import { createData, testData, type FixtureOverrides } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

type TestUser = {
  id: number | string
  collection: string
  _status?: 'published' | 'draft'
  roles?: string[]
} | null

type GeoJsonBody = {
  type?: string
  features?: EventFeature[]
  totalDocs?: number
  errors?: unknown
}

const SCHEDULE = {
  firstDate: '2025-01-06T10:00:00.000Z',
  firstDate_tz: 'Europe/London',
  recurrenceType: 'DAILY',
  interval: 1,
} as const

describe('eventsGeoJson endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let client: TestUser
  let regionId: number
  let managerId: number
  let offlineEventId: number
  let onlineEventId: number
  let draftEventId: number

  async function callGeoJson(
    query: Record<string, unknown>,
    user: TestUser = client,
  ): Promise<{ status: number; headers: Headers; body: GeoJsonBody }> {
    const req = {
      payload,
      query,
      headers: new Headers(),
      routeParams: {},
      user,
    } as unknown as PayloadRequest
    const response = (await eventsGeoJson.handler(req)) as Response
    return { status: response.status, headers: response.headers, body: await response.json() }
  }

  // Always-valid select (depth 1 so no populate is required).
  const SELECT = {
    select: { title: true, eventType: true, address: { latitude: true, longitude: true } },
    depth: 1,
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const manager = await testData.createManager(payload, {
      name: 'Geo Manager',
      email: 'geo-manager@example.com',
    })
    managerId = manager.id
    const clientDoc = await testData.createClient(payload, managerId, {
      name: 'Atlas GeoJSON Client',
      roles: ['sahaj-atlas-client'],
    })
    client = {
      id: clientDoc.id,
      collection: 'clients',
      _status: 'published',
      roles: ['sahaj-atlas-client'],
    }

    const region = await payload.create({
      collection: 'regions',
      overrideAccess: true,
      data: { name: 'Geo City', level: 'city', mapboxId: 'geo-city', slug: 'geo-city' },
    })
    regionId = region.id

    // Annotated rather than `as const`: the latter froze `languages` to a
    // readonly tuple, which no `string[]` field accepts.
    const common: FixtureOverrides<Event> = {
      languages: ['en'],
      registrationMode: 'sahaj-atlas',
      manager: managerId,
      region: regionId,
      schedule: SCHEDULE,
    }

    const offline = await payload.create({
      collection: 'events',
      overrideAccess: true,
      data: createData<'events'>({
        ...common,
        title: 'Offline Meetup',
        eventType: 'offline',
        address: {
          street: '1 Test St',
          city: 'London',
          country: 'GB',
          latitude: 51.5,
          longitude: -0.12,
        },
        _status: 'published',
      }),
    })
    offlineEventId = offline.id

    const online = await payload.create({
      collection: 'events',
      overrideAccess: true,
      data: createData<'events'>({
        ...common,
        title: 'Online Session',
        eventType: 'online',
        onlineUrl: 'https://example.com/meet',
        _status: 'published',
      }),
    })
    onlineEventId = online.id

    const draft = await payload.create({
      collection: 'events',
      overrideAccess: true,
      data: createData<'events'>({
        ...common,
        title: 'Draft Meetup',
        eventType: 'offline',
        address: { street: '2 Test St', city: 'London', country: 'GB', latitude: 52, longitude: 0 },
        _status: 'draft',
      }),
    })
    draftEventId = draft.id
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('auth gate', () => {
    it('rejects unauthenticated callers with 403', async () => {
      const { status } = await callGeoJson(SELECT, null)
      expect(status).toBe(403)
    })

    it('rejects managers with 403', async () => {
      const { status } = await callGeoJson(SELECT, { id: managerId, collection: 'managers' })
      expect(status).toBe(403)
    })

    it('rejects unpublished (draft) clients with 403', async () => {
      const { status } = await callGeoJson(SELECT, {
        id: client!.id,
        collection: 'clients',
        _status: 'draft',
        roles: ['sahaj-atlas-client'],
      })
      expect(status).toBe(403)
    })
  })

  describe('query-param enforcement (reuses validateClientQueryParamsHook)', () => {
    it('returns 400 when select is missing', async () => {
      const { status, body } = await callGeoJson({ depth: 1 })
      expect(status).toBe(400)
      expect(body).toHaveProperty('errors')
    })

    it('returns 400 when depth > 1 without populate', async () => {
      const { status } = await callGeoJson({ select: { title: true }, depth: 2 })
      expect(status).toBe(400)
    })

    /**
     * sydevs/SahajCloud#670. This handler forwards `where` verbatim and catches its own
     * errors, so Payload's root `afterError` hook — which only `routeError` invokes —
     * never sees a cast failure raised here. Without the explicit
     * `mapPostgresCastError` call in the catch, this is a flat 500 naming nothing.
     *
     * `eventType` is a `select` field (`Events.ts`), hence a Postgres enum column, and
     * the OpenAPI docs advertise filtering on it — so this is a documented client route,
     * not a contrived one. Driven against a real Postgres because the SQLSTATE is the
     * whole assertion; a mocked `find` could only re-assert the fixture.
     */
    it('returns 400 naming the value when a where filter fails an enum cast', async () => {
      const { status, body } = await callGeoJson({
        ...SELECT,
        where: { eventType: { equals: 'bogus' } },
      })
      expect(status).toBe(400)
      expect(body.errors).toEqual([
        { code: '22P02', message: expect.stringContaining('"bogus"') },
      ])
    })
  })

  describe('feature collection', () => {
    it('returns a FeatureCollection with pagination metadata', async () => {
      const { status, body } = await callGeoJson(SELECT)
      expect(status).toBe(200)
      expect(body.type).toBe('FeatureCollection')
      expect(Array.isArray(body.features)).toBe(true)
      expect(typeof body.totalDocs).toBe('number')
    })

    it('builds a Point [lon, lat] from an offline event address', async () => {
      const { body } = await callGeoJson(SELECT)
      const feature = body.features!.find((f) => f.id === offlineEventId)
      expect(feature?.geometry).toEqual({ type: 'Point', coordinates: [-0.12, 51.5] })
    })

    it('returns geometry: null for an event without coordinates', async () => {
      const { body } = await callGeoJson(SELECT)
      const feature = body.features!.find((f) => f.id === onlineEventId)
      expect(feature).toBeDefined()
      expect(feature?.geometry).toBeNull()
    })

    it('exposes the selected fields verbatim in properties', async () => {
      const { body } = await callGeoJson(SELECT)
      const feature = body.features!.find((f) => f.id === offlineEventId)
      expect(feature?.properties.title).toBe('Offline Meetup')
      expect(feature?.properties.eventType).toBe('offline')
    })

    it('excludes draft events (published-only access filter)', async () => {
      const { body } = await callGeoJson(SELECT)
      const ids = body.features!.map((f) => f.id)
      expect(ids).toContain(offlineEventId)
      expect(ids).not.toContain(draftEventId)
    })

    it('sets a cacheable Cache-Control header', async () => {
      const { headers } = await callGeoJson(SELECT)
      expect(headers.get('Cache-Control')).toBe('public, max-age=300, s-maxage=300')
    })
  })

  describe('canonical webPath / webUrl', () => {
    // The feed exposes the server-computed path so the Atlas widget navigates to
    // the final URL directly — no client-side breadcrumb walking, no redirect.
    it('exposes webPath + webUrl even when region is not selected', async () => {
      const { status, body } = await callGeoJson({
        select: { webPath: true, webUrl: true },
        depth: 1,
      })
      expect(status).toBe(200)
      const feature = body.features!.find((f) => f.id === offlineEventId)
      // Region "Geo City" (slug geo-city) has no parent → event path is
      // `/geo-city/<id>`. `region` was injected so the path resolves.
      expect(feature?.properties.webPath).toBe(`/geo-city/${offlineEventId}`)
      // No client owns this region, so `webUrl` is rooted at the We Meditate
      // surface rather than the (noindex) Atlas host — see #634.
      const base = `${serverEnv.WEMEDITATE_WEB_URL}${serverEnv.WEMEDITATE_ATLAS_BASE_PATH}`
      expect(feature?.properties.webUrl).toBe(`${base}/geo-city/${offlineEventId}`)
    })

    // Country slugs are ISO alpha-2 codes (#556) — a feature under a
    // country-rooted region chain carries the code as its path's first segment.
    it('reflects the ISO country slug in a country-rooted feature path', async () => {
      const country = await payload.create({
        collection: 'regions',
        overrideAccess: true,
        data: { name: 'United Kingdom', level: 'country', mapboxId: 'geo-country', slug: 'gb' },
      })
      const city = await payload.create({
        collection: 'regions',
        overrideAccess: true,
        data: {
          name: 'Geo Town',
          level: 'city',
          mapboxId: 'geo-town',
          slug: 'geo-town',
          parent: country.id,
        },
      })
      const event = await payload.create({
        collection: 'events',
        overrideAccess: true,
        data: createData<'events'>({
          title: 'Country-rooted Meetup',
          eventType: 'offline',
          languages: ['en'],
          registrationMode: 'sahaj-atlas',
          manager: managerId,
          region: city.id,
          schedule: SCHEDULE,
          address: {
            street: '3 Test St',
            city: 'London',
            country: 'GB',
            latitude: 51.5,
            longitude: -0.1,
          },
          _status: 'published',
        }),
      })

      const { body } = await callGeoJson({ select: { webPath: true }, depth: 1 })
      const feature = body.features!.find((f) => f.id === event.id)
      expect(feature?.properties.webPath).toBe(`/gb/geo-town/${event.id}`)
    })
  })

  // ────────────────────────────────────────────────────────────────────────────
  // Finished events (#603): published (so their pages resolve) but off the feed.
  // ────────────────────────────────────────────────────────────────────────────
  describe('finished events', () => {
    /** A published event with the given schedule; `lastDate` is computed on write. */
    const createEvent = async (
      title: string,
      schedule: Record<string, unknown>,
      extra: Record<string, unknown> = {},
    ) => {
      return payload.create({
        collection: 'events',
        overrideAccess: true,
        data: createData<'events'>({
          title,
          eventType: 'online',
          onlineUrl: 'https://example.com/meet',
          languages: ['en'],
          registrationMode: 'sahaj-atlas',
          manager: managerId,
          region: regionId,
          schedule,
          _status: 'published',
          ...extra,
        }),
      })
    }

    const featureIds = async (query: Record<string, unknown> = SELECT) => {
      const { body } = await callGeoJson(query)
      return body.features!.map((f) => f.id)
    }

    it('stores lastDate for a terminating schedule and null for an open-ended one', async () => {
      const course = await createEvent('Finite Course', {
        firstDate: '2025-01-06T10:00:00.000Z',
        firstDate_tz: 'Europe/London',
        recurrenceType: 'DAILY',
        interval: 1,
        endingType: 'count',
        count: 3,
      })
      const openEnded = await payload.findByID({
        collection: 'events',
        id: onlineEventId,
        overrideAccess: true,
      })

      // Jan 6, 7, 8 → end of Jan 8 local day (London is UTC+0 in January)
      expect(course.schedule?.lastDate).toBe('2025-01-08T23:59:59.999Z')
      expect(openEnded.schedule?.lastDate).toBeNull()
    })

    it('omits an event whose schedule has run out', async () => {
      const finished = await createEvent('Finished One-off', {
        firstDate: '2020-05-01T10:00:00.000Z',
        firstDate_tz: 'Europe/London',
      })

      expect(await featureIds()).not.toContain(finished.id)
      // …but it is still published, so its page keeps resolving
      const doc = await payload.findByID({
        collection: 'events',
        id: finished.id,
        overrideAccess: true,
      })
      expect(doc._status).toBe('published')
    })

    it('keeps an open-ended recurrence in the feed however old its firstDate', async () => {
      // The MAX_MONTHS_AHEAD false positive: yearly cadence, still running
      const yearly = await createEvent('Yearly Gathering', {
        firstDate: '2020-05-01T10:00:00.000Z',
        firstDate_tz: 'Europe/London',
        recurrenceType: 'MONTHLY',
        interval: 12,
        monthlyMode: 'date',
        monthDay: 1,
      })

      expect(await featureIds()).toContain(yearly.id)
    })

    it('keeps an event whose final occurrence is today until midnight in its own timezone', async () => {
      // A one-off whose only occurrence is *now* — so it has already happened,
      // yet the event stays listed because its local day hasn't ended. Anchored
      // to the current instant rather than a fixed clock: end-of-local-day is at
      // or after `now` in every timezone, so this can't straddle a midnight.
      // The timezone contrast itself is pinned in tests/unit/schedule-status.spec.ts.
      const firstDate = new Date().toISOString()
      const endsToday = await createEvent('Ends Today', {
        firstDate,
        firstDate_tz: 'Europe/Berlin',
      })

      expect(endsToday.schedule?.lastDate).not.toBeNull()
      expect(new Date(endsToday.schedule!.lastDate!).getTime()).toBeGreaterThanOrEqual(
        new Date(firstDate).getTime(),
      )
      expect(await featureIds()).toContain(endsToday.id)
    })

    it('never treats an inactive event as finished, however stale its firstDate', async () => {
      const dormant = await createEvent(
        'Dormant Group',
        { firstDate: '2019-01-01T10:00:00.000Z', firstDate_tz: 'Europe/London' },
        { inactive: true, contactPhone: '+44 20 7000 0000', contactName: 'Dormant Contact' },
      )

      expect(await featureIds()).toContain(dormant.id)
    })

    it('drops an event whose trailing occurrence is excluded', async () => {
      // Two occurrences 60 days apart, straddling now: one 30 days back, one 30
      // days ahead. Excluding the future one pulls lastDate into the past, so the
      // event leaves the feed — while the identical un-excluded rule stays.
      // Dates are calendar-anchored at midday so no local date can drift.
      const day = (offsetDays: number) =>
        new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10)
      const schedule = {
        firstDate: `${day(-30)}T12:00:00.000Z`,
        firstDate_tz: 'Europe/London',
        recurrenceType: 'DAILY' as const,
        interval: 60,
        endingType: 'count' as const,
        count: 2,
      }

      const running = await createEvent('Tail Intact', schedule)
      const trimmed = await createEvent('Tail Excluded', {
        ...schedule,
        // A generous range around the future occurrence — no exact-date guessing
        exclusions: [{ startDate: day(20), endDate: day(40) }],
      })

      const ids = await featureIds()
      expect(new Date(running.schedule!.lastDate!).getTime()).toBeGreaterThan(Date.now())
      expect(new Date(trimmed.schedule!.lastDate!).getTime()).toBeLessThan(Date.now())
      expect(ids).toContain(running.id)
      expect(ids).not.toContain(trimmed.id)
    })

    it('reflects the filter in totalDocs, not as a post-read drop', async () => {
      const { body } = await callGeoJson(SELECT)
      expect(body.totalDocs).toBe(body.features!.length)
    })

    it('composes with the caller’s own where', async () => {
      const finished = await createEvent('Finished Offline', {
        firstDate: '2020-06-01T10:00:00.000Z',
        firstDate_tz: 'Europe/London',
      })

      const ids = await featureIds({ ...SELECT, where: { eventType: { equals: 'online' } } })
      expect(ids).toContain(onlineEventId)
      expect(ids).not.toContain(offlineEventId) // the caller's filter still applies
      expect(ids).not.toContain(finished.id) // …and ours is ANDed on top
    })

    it('cannot be opted out of by a caller’s where on schedule.lastDate', async () => {
      const finished = await createEvent('Finished Unretrievable', {
        firstDate: '2020-07-01T10:00:00.000Z',
        firstDate_tz: 'Europe/London',
      })

      // The opt-out that works on `GET /api/events` must not work here.
      for (const where of [
        { 'schedule.lastDate': { exists: true } },
        { 'schedule.lastDate': { less_than: new Date().toISOString() } },
      ]) {
        expect(await featureIds({ ...SELECT, where })).not.toContain(finished.id)
      }
    })
  })
})
