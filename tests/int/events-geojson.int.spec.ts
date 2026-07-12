import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { eventsGeoJson } from '@/collections/Events/endpoints/geojson'
import type { EventFeature } from '@/collections/Events/endpoints/responseTypes'

import { testData } from '../utils/testData'
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
  recurrenceType: 'DAILY' as const,
  interval: 1,
}

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

    const common = {
      languages: ['en'],
      registrationMode: 'sahaj-atlas',
      manager: managerId,
      region: regionId,
      schedule: SCHEDULE,
    } as const

    const offline = await payload.create({
      collection: 'events',
      overrideAccess: true,
      data: {
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
      },
    })
    offlineEventId = offline.id

    const online = await payload.create({
      collection: 'events',
      overrideAccess: true,
      data: {
        ...common,
        title: 'Online Session',
        eventType: 'online',
        onlineUrl: 'https://example.com/meet',
        _status: 'published',
      },
    })
    onlineEventId = online.id

    const draft = await payload.create({
      collection: 'events',
      overrideAccess: true,
      data: {
        ...common,
        title: 'Draft Meetup',
        eventType: 'offline',
        address: { street: '2 Test St', city: 'London', country: 'GB', latitude: 52, longitude: 0 },
        _status: 'draft',
      },
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
      expect(feature?.properties.webUrl).toBe(`http://localhost:5174/geo-city/${offlineEventId}`)
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
        data: {
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
        },
      })

      const { body } = await callGeoJson({ select: { webPath: true }, depth: 1 })
      const feature = body.features!.find((f) => f.id === event.id)
      expect(feature?.properties.webPath).toBe(`/gb/geo-town/${event.id}`)
    })
  })
})
