/**
 * The chunked resolve endpoint (#828): who may run it, what it writes back, and
 * what it refuses.
 *
 * Mapbox is mocked at the module boundary — `geocodeLocation` is the one call
 * this endpoint makes over the network, and the rules worth asserting here are
 * about what the answer decides, not about the answer. `resolveRow`'s own spec
 * covers the per-row decisions; this one covers the parts only a database can
 * answer: the subtree check, the existing classes a row is compared against,
 * and the chunk boundary.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { RESOLVE_CHUNK_ROWS } from '@/collections/EventImports/constants'
import { resolveEventImport } from '@/collections/EventImports/endpoints/resolve'
import type { GeocodedLocation } from '@/lib/mapbox/geocoder'
import type { Client, Event, EventImport, EventImportRows, Manager, Region } from '@/payload-types'

import { createData, testData, type FixtureOverrides } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const { geocodeLocation } = vi.hoisted(() => ({ geocodeLocation: vi.fn() }))

vi.mock('@/lib/mapbox/geocoder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mapbox/geocoder')>()),
  geocodeLocation,
}))

/** Tuesday 18:30 in Berlin, as the instant `firstDate` stores. */
const TUESDAY_1830_BERLIN = '2026-10-06T16:30:00.000Z'

const BERLIN: GeocodedLocation = {
  mapboxId: 'mbx-address',
  latitude: 52.5026,
  longitude: 13.4186,
  countryCode: 'DE',
  subdivisionCode: 'BE',
  placeName: 'Berlin',
  placeId: 'mbx-berlin',
  featureType: 'address',
  regionMapboxId: null,
}

/** One CSV row as the parse step leaves it. */
function row(line: number, values: Record<string, string> = {}): EventImportRows[number] {
  return {
    line,
    values: {
      title: `Class ${line}`,
      eventType: 'offline',
      country: 'DE',
      city: 'Berlin',
      address: `Oranienstraße ${line}`,
      scheduleType: 'weekly',
      weekdays: 'TU',
      startTime: '18:30',
      ...values,
    },
  }
}

describe('resolve endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let admin: Manager
  let uploader: Manager
  let outsider: Manager
  let inactiveManager: Manager
  let client: Client
  let germany: Region
  let berlinCity: Region
  let unnamedCountry: Region

  const reqAs = (user: Manager, id: number): PayloadRequest =>
    ({
      payload,
      headers: new Headers(),
      routeParams: { id: String(id) },
      user,
      locale: 'en',
      context: {},
      // ⚠ **What a real bodiless POST does.** `Request.json()` on an empty body
      // rejects, and Payload never populates `req.data` for a custom endpoint —
      // so a handler that reads a body answers 400 to its own review UI. A bare
      // object with no `json` at all hides that, which is how it shipped once.
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input')
      },
    }) as unknown as PayloadRequest

  async function call(
    user: Manager,
    id: number,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = (await resolveEventImport.handler(reqAs(user, id))) as Response
    return { status: response.status, body: (await response.json()) as Record<string, unknown> }
  }

  const createBatch = (overrides: FixtureOverrides<EventImport> = {}) =>
    payload.create({
      collection: 'event-imports',
      data: createData<'event-imports'>({
        targetRegion: germany.id,
        uploader: uploader.id,
        defaultLanguages: ['de'],
        ...overrides,
      }),
      overrideAccess: true,
    })

  const readRows = async (id: number): Promise<EventImportRows> => {
    const batch = await payload.findByID({
      collection: 'event-imports',
      id,
      depth: 0,
      overrideAccess: true,
    })
    return (batch.rows ?? []) as EventImportRows
  }

  const statusOf = async (id: number): Promise<EventImport['status']> =>
    (
      await payload.findByID({
        collection: 'event-imports',
        id,
        depth: 0,
        overrideAccess: true,
      })
    ).status

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    admin = env.adminUser

    uploader = await testData.createManager(payload, {
      name: 'Resolve Uploader',
      email: 'resolve-uploader@example.com',
      roles: ['atlas-manager'],
    })
    outsider = await testData.createManager(payload, {
      name: 'Resolve Outsider',
      email: 'resolve-outsider@example.com',
      roles: ['atlas-manager'],
    })
    inactiveManager = await testData.createManager(payload, {
      name: 'Resolve Retired',
      email: 'resolve-retired@example.com',
      type: 'inactive' as const,
      roles: ['atlas-manager'],
    })
    client = await testData.createClient(payload, admin.id, {
      name: 'Resolve Atlas Widget',
      roles: ['sahaj-atlas-client'],
    })

    // ⚠ The name is the fixture, not decoration: the target's country code is
    // read off the chain, so a region called "Test Country" resolves to no ISO
    // country and every batch under it is refused.
    germany = await testData.createRegion(payload, {
      name: 'Germany',
      level: 'country',
      managers: [uploader.id],
    })
    berlinCity = await testData.createRegion(payload, {
      name: 'Berlin',
      level: 'city',
      parent: germany.id,
    })
    unnamedCountry = await testData.createRegion(payload, {
      name: 'Nowhere In Particular',
      level: 'country',
      managers: [uploader.id],
    })
    // ⚠ The outsider has to manage *something*, or `ownedRegionFilterOptions`
    // answers `false` and the 403 comes from "you manage no region" — which
    // passes a subtree test without the subtree check ever running.
    await testData.createRegion(payload, {
      name: 'Austria',
      level: 'country',
      managers: [outsider.id],
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  /** The geocoder answers with an outcome, so a miss and an outage stay distinct. */
  const found = (overrides: Partial<GeocodedLocation> = {}) => ({
    status: 'found' as const,
    location: { ...BERLIN, ...overrides },
  })

  beforeEach(() => {
    geocodeLocation.mockReset()
    geocodeLocation.mockResolvedValue(found())
  })

  describe('writing the answers back', () => {
    it('resolves every pending row and moves the status once none is left', async () => {
      const batch = await createBatch({ rows: [row(2), row(3)] })

      const { status, body } = await call(uploader, batch.id)

      expect(status).toBe(200)
      expect(body).toMatchObject({ total: 2, errors: 0, pending: 0, done: true })
      expect(await statusOf(batch.id)).toBe('resolved')

      const [first] = await readRows(batch.id)
      expect(first?.resolved).toMatchObject({
        latitude: 52.5026,
        longitude: 13.4186,
        timezone: 'Europe/Berlin',
        cityKey: 'berlin',
        placeId: 'mbx-berlin',
        languages: ['de'],
        inactive: false,
        weekdayMask: 0b10,
        startMinutes: 1110,
      })
    })

    it('leaves an already-answered row alone when called again', async () => {
      // The endpoint is called until it reports `done`, and a dropped response
      // means the client calls it twice over the same rows.
      const batch = await createBatch({ rows: [row(2)] })
      await call(uploader, batch.id)
      expect(geocodeLocation).toHaveBeenCalledTimes(1)

      const { body } = await call(uploader, batch.id)

      expect(geocodeLocation).toHaveBeenCalledTimes(1)
      expect(body).toMatchObject({ resolved: 1, pending: 0, done: true })
    })

    it('resolves at most one chunk per call', async () => {
      const rows = Array.from({ length: RESOLVE_CHUNK_ROWS + 2 }, (_, index) => row(index + 2))
      const batch = await createBatch({ rows })

      const first = await call(uploader, batch.id)

      expect(first.body).toMatchObject({ pending: 2, done: false })
      // The commit requires `resolved`, so the status must not move early.
      expect(await statusOf(batch.id)).toBe('uploaded')

      const second = await call(uploader, batch.id)
      expect(second.body).toMatchObject({ pending: 0, done: true })
      expect(await statusOf(batch.id)).toBe('resolved')
    })

    it('reports a row with no answer without spending a geocode on it', async () => {
      const batch = await createBatch({ rows: [row(2, { country: 'FR' })] })

      const { body } = await call(uploader, batch.id)

      expect(geocodeLocation).not.toHaveBeenCalled()
      expect(body).toMatchObject({ errors: 1, resolved: 0, done: true })
      const [only] = await readRows(batch.id)
      expect(only?.errors?.[0]).toContain('outside the target (DE)')
      expect(only?.resolved).toBeUndefined()
    })

    it('still reaches `resolved` when every row failed the parse', async () => {
      // Nothing is pending from the first call, so the early return is the only
      // path — and it has to write the status, or the commit step refuses a
      // batch the UI already calls done.
      const batch = await createBatch({
        rows: [{ ...row(2), errors: ['eventType is required'] }],
      })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ pending: 0, done: true })
      expect(await statusOf(batch.id)).toBe('resolved')
    })

    it('keeps the parse step’s errors beside its own', async () => {
      const batch = await createBatch({
        rows: [{ ...row(2), errors: ['address is required'] }],
      })

      const { body } = await call(uploader, batch.id)

      // A row that already failed the parse is never pending, so it is not
      // geocoded — and its error survives.
      expect(geocodeLocation).not.toHaveBeenCalled()
      expect(body).toMatchObject({ errors: 1, pending: 0, done: true })
      expect((await readRows(batch.id))[0]?.errors).toEqual(['address is required'])
    })
  })

  describe('duplicates', () => {
    let existing: Event

    beforeAll(async () => {
      existing = await testData.createEvent(payload, {
        title: 'Tuesday Evening Meditation',
        region: berlinCity.id,
        inactive: false,
        address: {
          mapboxId: 'mbx-existing',
          street: 'Oranienstraße 25',
          city: 'Berlin',
          country: 'DE',
          latitude: 52.5026,
          longitude: 13.4186,
        },
        schedule: {
          firstDate: TUESDAY_1830_BERLIN,
          firstDate_tz: 'Europe/Berlin',
          recurrenceType: 'WEEKLY',
          weekdays: ['TU'],
          interval: 1,
        },
      })
    })

    it('flags a row that repeats a class already in the subtree', async () => {
      const batch = await createBatch({ rows: [row(2)] })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ duplicates: 1, resolved: 0 })
      const [only] = await readRows(batch.id)
      expect(only?.duplicate).toEqual({
        reason: 'nearby-address',
        strength: 'strong',
        eventId: existing.id,
      })
      // The match is reported, never written: nothing about the existing class
      // changes, and the row keeps its own answers for the review to show.
      expect(only?.resolved?.cityKey).toBe('berlin')
    })

    it('flags a row that repeats an earlier line in the same file', async () => {
      // Far from the existing class, so only the two rows can match each other.
      geocodeLocation.mockResolvedValue(
        found({
          latitude: 48.1371,
          longitude: 11.5754,
          placeName: 'München',
          placeId: 'mbx-munich',
        }),
      )
      const batch = await createBatch({ rows: [row(2), row(3)] })

      await call(uploader, batch.id)

      const rows = await readRows(batch.id)
      expect(rows[0]?.duplicate).toBeUndefined()
      expect(rows[1]?.duplicate).toEqual({ reason: 'nearby-address', strength: 'strong', line: 2 })
    })

    it('finds a match across the chunk boundary', async () => {
      // A row the previous call resolved is still a candidate, or two chunks
      // would each publish the same class.
      geocodeLocation.mockResolvedValue(
        found({ latitude: 50.9375, longitude: 6.9603, placeName: 'Köln', placeId: 'mbx-cologne' }),
      )
      const rows = Array.from({ length: RESOLVE_CHUNK_ROWS + 1 }, (_, index) => row(index + 2))
      const batch = await createBatch({ rows })

      await call(uploader, batch.id)
      await call(uploader, batch.id)

      const written = await readRows(batch.id)
      expect(written[RESOLVE_CHUNK_ROWS]?.duplicate).toMatchObject({ line: 2 })
    })

    it('does not merge two online classes that share their city centroid', async () => {
      // ⚠ Every online row in one city geocodes to the same place centroid, and
      // `nearby-address` is checked before the time rule — so a point on an
      // online row merged an 18:00 and a 20:00 class into one.
      geocodeLocation.mockResolvedValue(
        found({ latitude: 48.1371, longitude: 11.5754, placeName: 'München', placeId: 'mbx-mun' }),
      )
      const online = (line: number, startTime: string) =>
        row(line, {
          eventType: 'online',
          city: 'München',
          address: '',
          onlineUrl: 'https://example.org/z',
          startTime,
        })
      const batch = await createBatch({ rows: [online(2, '18:00'), online(3, '20:00')] })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ resolved: 2, duplicates: 0 })
    })

    it('still merges two online classes at the same city and time', async () => {
      geocodeLocation.mockResolvedValue(
        found({ latitude: 50.9375, longitude: 6.9603, placeName: 'Köln', placeId: 'mbx-cgn' }),
      )
      const online = (line: number) =>
        row(line, {
          eventType: 'online',
          city: 'Köln',
          address: '',
          onlineUrl: 'https://example.org/z',
        })
      const batch = await createBatch({ rows: [online(2), online(3)] })

      await call(uploader, batch.id)

      expect((await readRows(batch.id))[1]?.duplicate).toEqual({
        reason: 'city-and-time',
        strength: 'weak',
        line: 2,
      })
    })

    it('does not compare a row against a finished class', async () => {
      // ⚠ `excludeFinishedEvents` only fires for an API client, so a manager's
      // read sees last year's expired series — and it sits at the same hall as
      // the row re-importing this year's timetable.
      const hamburg = await testData.createRegion(payload, {
        name: 'Hamburg',
        level: 'city',
        parent: germany.id,
      })
      await testData.createEvent(payload, {
        title: 'Last Year’s Tuesday Class',
        region: hamburg.id,
        inactive: false,
        address: {
          mapboxId: 'mbx-finished',
          street: 'Reeperbahn 1',
          city: 'Hamburg',
          country: 'DE',
          latitude: 53.5503,
          longitude: 9.9937,
        },
        schedule: {
          firstDate: '2024-10-01T16:30:00.000Z',
          firstDate_tz: 'Europe/Berlin',
          recurrenceType: 'WEEKLY',
          weekdays: ['TU'],
          interval: 1,
          endingType: 'until',
          untilDate: '2024-12-31',
        },
      })
      geocodeLocation.mockResolvedValue(
        found({ latitude: 53.5503, longitude: 9.9937, placeName: 'Hamburg', placeId: 'mbx-hh' }),
      )

      const batch = await createBatch({ rows: [row(2, { city: 'Hamburg' })] })
      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ resolved: 1, duplicates: 0 })
    })

    it('does not compare a row against a class outside the target subtree', async () => {
      const elsewhere = await testData.createRegion(payload, {
        name: 'Another Country',
        level: 'country',
      })
      // An event hangs off a city or a venue, never a country.
      const lyon = await testData.createRegion(payload, {
        name: 'Lyon',
        level: 'city',
        parent: elsewhere.id,
      })
      await testData.createEvent(payload, {
        title: 'Same Hall, Other Country',
        region: lyon.id,
        inactive: false,
        address: {
          mapboxId: 'mbx-elsewhere',
          street: 'Rue Unique 1',
          city: 'Lyon',
          country: 'FR',
          latitude: 45.764,
          longitude: 4.8357,
        },
        schedule: {
          firstDate: TUESDAY_1830_BERLIN,
          firstDate_tz: 'Europe/Berlin',
          recurrenceType: 'WEEKLY',
          weekdays: ['TU'],
          interval: 1,
        },
      })
      geocodeLocation.mockResolvedValue(
        found({ latitude: 45.764, longitude: 4.8357, placeName: 'Lyon', placeId: 'mbx-lyon' }),
      )

      const batch = await createBatch({ rows: [row(2)] })
      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ duplicates: 0, resolved: 1 })
    })
  })

  describe('refusals', () => {
    it('refuses the uploader of a batch targeting a region they do not manage', async () => {
      // ⚠ The collection's `access` cannot catch this one: the batch IS theirs,
      // so they may read and update it. Only the explicit subtree check stands
      // between them and writing rows about somebody else's country — which is
      // why the endpoint re-runs it rather than trusting the read that got here.
      const theirs = await createBatch({ uploader: outsider.id, targetRegion: germany.id })

      const { status, body } = await call(outsider, theirs.id)

      expect(status).toBe(403)
      // The specific message, not just "do not manage": the other 403 is "you do
      // not manage any region", which a substring match would also accept — and
      // that one fires without the subtree check this case is named for.
      expect(JSON.stringify(body)).toContain('do not manage that region')
    })

    it('refuses an inactive manager and a published API client', async () => {
      // ⚠ **This pins a coupling three files away.** `refuseUnownedTarget` reads
      // `ownedRegionFilterOptions`' `true` as "admin", and that holds only
      // because `requireActiveManager` has already turned away every caller
      // whose `type` is not `manager` or `admin`. Reorder the two guards and
      // `true` starts meaning "inactive", "a client", or "nobody" — a full
      // subtree bypass that nothing else here would catch.
      const batch = await createBatch({ rows: [row(2)] })

      expect((await call(inactiveManager, batch.id)).status).toBe(403)
      expect((await call(client as unknown as Manager, batch.id)).status).toBe(403)
      expect(geocodeLocation).not.toHaveBeenCalled()
    })

    it('lets an admin resolve a batch in a region they do not manage', async () => {
      const batch = await createBatch({ rows: [row(2, { city: 'Hamburg' })] })
      geocodeLocation.mockResolvedValue(
        found({ latitude: 53.5503, longitude: 9.9937, placeName: 'Hamburg', placeId: 'mbx-hh' }),
      )

      const { status, body } = await call(admin, batch.id)

      // Not just a 200: the chunk has to have actually drained.
      expect(status).toBe(200)
      expect(body).toMatchObject({ resolved: 1, pending: 0, done: true })
    })

    it('resolves a batch under a state with no ISO code, and reports the narrowing it lost', async () => {
      // The UK shape: `country-region-data` lists GB's 217 councils and no
      // South East, so a refusal here made every UK region unimportable.
      const uk = await testData.createRegion(payload, {
        name: 'United Kingdom',
        level: 'country',
        managers: [uploader.id],
      })
      const southEast = await testData.createRegion(payload, {
        name: 'South East',
        level: 'region',
        parent: uk.id,
      })
      geocodeLocation.mockResolvedValue(
        found({
          latitude: 51.5072,
          longitude: -0.1276,
          countryCode: 'GB',
          subdivisionCode: 'LND',
          placeName: 'London',
          placeId: 'mbx-london',
        }),
      )
      const batch = await createBatch({
        targetRegion: southEast.id,
        rows: [row(2, { country: 'GB', city: 'London', address: '10 Downing Street' })],
      })

      const { status, body } = await call(uploader, batch.id)

      expect(status).toBe(200)
      expect(body).toMatchObject({ resolved: 1, errors: 0 })
      expect(String(body.warning)).toContain('South East')
    })

    it('refuses a batch whose target resolves to no ISO country, naming it', async () => {
      const batch = await createBatch({ targetRegion: unnamedCountry.id, rows: [row(2)] })

      const { status, body } = await call(uploader, batch.id)

      expect(status).toBe(422)
      expect(JSON.stringify(body)).toContain('Nowhere In Particular')
      // Refused before any row is touched, so no geocode is spent either.
      expect(geocodeLocation).not.toHaveBeenCalled()
      expect((await readRows(batch.id))[0]?.resolved).toBeUndefined()
    })

    it('leaves a row pending when the geocoder is unavailable, and keeps the rows before it', async () => {
      // ⚠ An outage says nothing about the row. Writing "could not find this
      // location" on it would turn minutes of Mapbox trouble into addresses a
      // volunteer can only fix by re-uploading the file — and the rows that did
      // resolve have to survive, or the next call restarts instead of resuming.
      // Hamburg, so the row does not collide with the class the duplicate
      // suite left in Berlin.
      geocodeLocation
        .mockResolvedValueOnce(
          found({ latitude: 53.5503, longitude: 9.9937, placeName: 'Hamburg', placeId: 'mbx-hh' }),
        )
        .mockResolvedValue({ status: 'unavailable' as const })
      const batch = await createBatch({ rows: [row(2), row(3), row(4)] })

      const { status, body } = await call(uploader, batch.id)

      expect(status).toBe(503)
      expect(body).toMatchObject({ resolved: 1, pending: 2 })
      const rows = await readRows(batch.id)
      expect(rows[0]?.resolved).toBeDefined()
      expect(rows[1]?.errors).toBeUndefined()
      expect(rows[1]?.resolved).toBeUndefined()
      // The status must not move while rows are still waiting for an answer.
      expect(await statusOf(batch.id)).toBe('uploaded')
    })

    it('reports a miss as the row’s own error, unlike an outage', async () => {
      geocodeLocation.mockResolvedValue({ status: 'missed' as const })
      const batch = await createBatch({ rows: [row(2)] })

      const { status, body } = await call(uploader, batch.id)

      expect(status).toBe(200)
      expect(body).toMatchObject({ errors: 1, pending: 0, done: true })
      expect((await readRows(batch.id))[0]?.errors?.[0]).toContain('could not find this location')
    })

    /**
     * ⚠ **A deterministic refusal is the row's, not an outage.** Treated as
     * "unavailable", the same row came first in every chunk, and a Resume could
     * never get past it to the rows after.
     */
    it('reports an address Mapbox refused as the row’s own error, and moves on', async () => {
      geocodeLocation
        .mockResolvedValueOnce({ status: 'refused' as const, httpStatus: 400 })
        .mockResolvedValue(
          found({ latitude: 48.1, longitude: 11.5, placeName: 'Munich', placeId: 'mbx-mu' }),
        )
      const batch = await createBatch({ rows: [row(2), row(3)] })

      const { status, body } = await call(uploader, batch.id)

      expect(status).toBe(200)
      expect(body).toMatchObject({ errors: 1, pending: 0, done: true })
      expect((await readRows(batch.id))[0]?.errors?.[0]).toContain('HTTP 400')
    })

    it('names a missing geocoder configuration rather than an outage', async () => {
      geocodeLocation.mockResolvedValue({ status: 'unconfigured' as const, httpStatus: null })
      const batch = await createBatch({ rows: [row(2)] })

      const { status, body } = await call(uploader, batch.id)

      expect(status).toBe(503)
      expect(JSON.stringify(body.errors)).toContain('not configured')
      expect((await readRows(batch.id))[0]?.errors).toBeUndefined()
    })

    /**
     * ⚠ **One request at a time.** Two concurrent resolves each geocoded the same
     * chunk, and whichever wrote last could put rows back to pending under a
     * batch already marked `resolved`.
     */
    it('lets one of two concurrent calls work the batch, and tells the other to wait', async () => {
      let release: () => void = () => undefined
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      geocodeLocation.mockImplementation(async () => {
        await gate
        return found({ latitude: 50.1, longitude: 8.7, placeName: 'Frankfurt', placeId: 'mbx-ff' })
      })
      const batch = await createBatch({ rows: [row(2)] })

      const first = call(uploader, batch.id)
      // Let the first claim the lease before the second asks.
      await new Promise((resolve) => setTimeout(resolve, 200))
      const second = await call(uploader, batch.id)
      release()

      expect(second.status).toBe(409)
      expect(second.body).toMatchObject({ busy: true })
      expect((await first).status).toBe(200)
      expect(geocodeLocation).toHaveBeenCalledTimes(1)
    })

    /** Ownership of the region outlives a revoked role; the import must not. */
    it('refuses a manager whose role was revoked after the upload', async () => {
      const revoked = await testData.createManager(payload, {
        name: 'Resolve Revoked',
        email: 'resolve-revoked@example.com',
        roles: [],
      })
      await payload.update({
        collection: 'regions',
        id: germany.id,
        data: { managers: [uploader.id, revoked.id] },
        overrideAccess: true,
      })
      const batch = await createBatch({ uploader: revoked.id, rows: [row(2)] })

      expect((await call(revoked, batch.id)).status).toBe(403)
      expect(geocodeLocation).not.toHaveBeenCalled()
    })

    it('refuses a batch that is already committing', async () => {
      const batch = await createBatch({ status: 'committing', rows: [row(2)] })
      expect((await call(uploader, batch.id)).status).toBe(409)
    })

    it('answers 404 for a batch the caller cannot see', async () => {
      // The collection's own access scopes a batch to its uploader, so another
      // manager's batch is indistinguishable from one that is not there — a 403
      // here would say that somebody else's import exists.
      const theirs = await createBatch({ uploader: outsider.id })
      expect((await call(uploader, theirs.id)).status).toBe(404)
    })

    it('refuses a non-numeric id', async () => {
      const response = (await resolveEventImport.handler({
        payload,
        headers: new Headers(),
        routeParams: { id: 'latest' },
        user: uploader,
        locale: 'en',
        context: {},
      } as unknown as PayloadRequest)) as Response
      expect(response.status).toBe(400)
    })
  })
})
