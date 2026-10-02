/**
 * The propose endpoint (#828): the tree it writes back, and what it refuses.
 *
 * `buildProposedTree` and its four parts are pinned by their own unit specs, with
 * `existing` and `takenSlugs` handed in. This covers only what those cannot: that
 * the endpoint hands them the right tree reads. Three of its four arguments are
 * database answers — the target's subtree, the regions holding a feature this
 * batch geocoded, and the collection-wide slug namespace — and getting any of
 * them wrong creates a region that is wrong rather than merely misplaced.
 *
 * No Mapbox mock: every geocode answer is already on the rows by the time this
 * endpoint runs, which is the point of storing them.
 *
 * ⚠ **Every test tags its own places, and nothing is deleted afterwards.** One
 * database serves the file, `Regions.mapboxId` and `Regions.slug` are both unique
 * collection-wide, and `event_imports.targetRegion` is `NOT NULL` — so a region a
 * batch points at cannot be cleaned up, and an untagged "Berlin" would make the
 * next test's proposal match or collide with the last test's fixture.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { proposeEventImport } from '@/collections/EventImports/endpoints/propose'
import type {
  Client,
  EventImport,
  EventImportProposedRegions,
  EventImportRows,
  Manager,
  Region,
} from '@/payload-types'

import { createData, testData, type FixtureOverrides } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

type Node = EventImportProposedRegions['nodes'][number]

/** Far enough apart that the metro merge leaves them separate cities. */
const PLACES = {
  berlin: { city: 'Berlin', latitude: 52.52, longitude: 13.405, state: 'BE' },
  munich: { city: 'Munich', latitude: 48.137, longitude: 11.575, state: 'BY' },
  hamburg: { city: 'Hamburg', latitude: 53.55, longitude: 9.993, state: 'HH' },
} as const

type PlaceName = keyof typeof PLACES

interface RowOptions {
  place?: PlaceName
  address?: string
  venueName?: string
  /** The address feature, which is what folds two spellings of one hall into one. */
  addressId?: string
  /** Distinguishes two places this test wants the grouping to keep apart. */
  nth?: number
  errors?: string[]
  duplicate?: boolean
}

/**
 * One row as the resolve step leaves it: an answer, and no reason it cannot have
 * one. `tag` scopes every name and feature id to the calling test — see the
 * header.
 */
function rowIn(tag: string) {
  return (line: number, options: RowOptions = {}): EventImportRows[number] => {
    const place = PLACES[options.place ?? 'berlin']
    const city = cityName(tag, options.place ?? 'berlin', options.nth)
    return {
      line,
      values: {
        title: `Class ${line}`,
        eventType: 'offline',
        country: 'DE',
        city,
        address: options.address ?? `Oranienstraße ${line}`,
        ...(options.venueName ? { venueName: options.venueName } : {}),
      },
      ...(options.errors ? { errors: options.errors } : {}),
      ...(options.duplicate ? { duplicate: { reason: 'city-and-time' as const, line: 2 } } : {}),
      resolved: {
        latitude: place.latitude,
        longitude: place.longitude,
        timezone: 'Europe/Berlin',
        cityKey: city.toLowerCase(),
        placeName: city,
        placeId: placeId(tag, options.place ?? 'berlin', options.nth),
        mapboxId: options.addressId ?? `mbx-${tag}-addr-${line}`,
        subdivisionCode: place.state,
        weekdayMask: 0b10,
        startMinutes: 1110,
        languages: ['de'],
        inactive: false,
        anchorDate: '2026-10-01',
      },
    }
  }
}

const cityName = (tag: string, place: PlaceName, nth?: number): string =>
  `${PLACES[place].city} ${tag}${nth === undefined ? '' : `-${nth}`}`

const placeId = (tag: string, place: PlaceName, nth?: number): string =>
  `mbx-${tag}-${place}${nth === undefined ? '' : `-${nth}`}`

describe('propose endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let admin: Manager
  let uploader: Manager
  let outsider: Manager
  let inactiveManager: Manager
  let client: Client
  let germany: Region
  let austria: Region

  const reqAs = (user: Manager | Client, id: number): PayloadRequest =>
    ({
      payload,
      headers: new Headers(),
      routeParams: { id: String(id) },
      user,
      locale: 'en',
      context: {},
      // What a real bodiless POST does: `Request.json()` on an empty body
      // rejects, and Payload never populates `req.data` for a custom endpoint.
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input')
      },
    }) as unknown as PayloadRequest

  async function call(
    user: Manager | Client,
    id: number,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = (await proposeEventImport.handler(reqAs(user, id))) as Response
    return { status: response.status, body: (await response.json()) as Record<string, unknown> }
  }

  /** The tree the call returned, which is also the one it stored. */
  async function propose(
    rows: EventImportRows,
    overrides: FixtureOverrides<EventImport> = {},
  ): Promise<{ tree: EventImportProposedRegions; body: Record<string, unknown> }> {
    const batch = await createBatch({ rows, status: 'resolved', ...overrides })
    const { status, body } = await call(uploader, batch.id)
    expect(status).toBe(200)
    expect(await storedTree(batch.id)).toEqual(body.proposedRegions)
    return { tree: body.proposedRegions as EventImportProposedRegions, body }
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

  const storedTree = async (id: number): Promise<EventImportProposedRegions | undefined> =>
    (
      await payload.findByID({ collection: 'event-imports', id, depth: 0, overrideAccess: true })
    ).proposedRegions

  const nodeFor = (
    tree: EventImportProposedRegions,
    tag: string,
    place: PlaceName,
  ): Node | undefined => tree.nodes.find((node) => node.key === `city:id:${placeId(tag, place)}`)

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    admin = env.adminUser

    uploader = await testData.createManager(payload, {
      name: 'Propose Uploader',
      email: 'propose-uploader@example.com',
      roles: ['atlas-manager'],
    })
    outsider = await testData.createManager(payload, {
      name: 'Propose Outsider',
      email: 'propose-outsider@example.com',
      roles: ['atlas-manager'],
    })
    inactiveManager = await testData.createManager(payload, {
      name: 'Propose Retired',
      email: 'propose-retired@example.com',
      type: 'inactive' as const,
      roles: ['atlas-manager'],
    })
    client = await testData.createClient(payload, admin.id, {
      name: 'Propose Atlas Widget',
      roles: ['sahaj-atlas-client'],
    })

    // ⚠ The name is the fixture: the country code is read off the chain, so a
    // region called "Test Country" matches no ISO country and every batch under
    // it is refused before a tree is built.
    germany = await testData.createRegion(payload, {
      name: 'Germany',
      level: 'country',
      managers: [uploader.id],
    })
    // ⚠ The outsider has to manage *something*, or `ownedRegionFilterOptions`
    // answers `false` and the 403 comes from "you manage no region" — which
    // passes a subtree test without the subtree check ever running.
    austria = await testData.createRegion(payload, {
      name: 'Austria',
      level: 'country',
      managers: [outsider.id],
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('the tree it writes', () => {
    it('proposes one city per place and stores what it returns', async () => {
      const row = rowIn('solo')
      const { tree, body } = await propose([
        row(2),
        row(3),
        row(4, { place: 'munich', address: 'Sendlinger Straße 4' }),
      ])

      expect(body).toMatchObject({ creating: 2, existing: 0, rowErrors: 0 })
      expect(nodeFor(tree, 'solo', 'berlin')).toMatchObject({
        level: 'city',
        name: 'Berlin solo',
        parentKey: null,
        match: { kind: 'create' },
        slug: 'berlin-solo',
        location: { kind: 'mapbox', mapboxId: 'mbx-solo-berlin' },
        lines: [2, 3],
      })
      expect(nodeFor(tree, 'solo', 'munich')).toMatchObject({ slug: 'munich-solo', lines: [4] })
    })

    it('matches a city the target already holds instead of proposing a second one', async () => {
      const row = rowIn('held')
      const berlin = await testData.createRegion(payload, {
        name: cityName('held', 'berlin'),
        level: 'city',
        parent: germany.id,
        mapboxId: placeId('held', 'berlin'),
      })

      const { tree, body } = await propose([row(2)])

      expect(body).toMatchObject({ creating: 0, existing: 1, rowErrors: 0 })
      expect(nodeFor(tree, 'held', 'berlin')).toMatchObject({
        match: { kind: 'existing', regionId: berlin.id, name: 'Berlin held' },
        // Nothing is created, so there is no slug to spend and no location to write.
        slug: null,
        location: null,
      })
    })

    it('refuses the rows of a city whose feature is managed outside the target', async () => {
      const row = rowIn('foreign')
      // The same Mapbox feature, under a country this uploader does not manage.
      await testData.createRegion(payload, {
        name: 'Somebody Elses Hamburg',
        level: 'city',
        parent: austria.id,
        mapboxId: placeId('foreign', 'hamburg'),
      })

      const { tree, body } = await propose([
        row(2, { place: 'hamburg' }),
        row(3, { place: 'hamburg' }),
      ])

      expect(body).toMatchObject({ creating: 0, rowErrors: 2 })
      expect(tree.rowErrors.map((error) => error.line)).toEqual([2, 3])
      // ⚠ Named by the city the volunteer typed, never by the region holding it:
      // that region is outside their subtree, which is why the import stops and
      // also why their tree is not theirs to be told about.
      expect(tree.rowErrors[0]?.message).toContain('Hamburg foreign')
      expect(tree.rowErrors[0]?.message).not.toContain('Somebody Else')
      expect(nodeFor(tree, 'foreign', 'hamburg')?.match).toMatchObject({ kind: 'elsewhere' })
    })

    it('disambiguates a slug against the whole collection, not the target subtree', async () => {
      const row = rowIn('taken')
      // ⚠ Outside the target on purpose. `Regions.slug` is unique
      // collection-wide, so a namespace read scoped to the subtree would propose
      // `munich-taken` here and the commit would fail on the constraint.
      const elsewhere = await testData.createRegion(payload, {
        name: cityName('taken', 'munich'),
        level: 'city',
        parent: austria.id,
      })
      expect(elsewhere.slug).toBe('munich-taken')

      const { tree } = await propose([row(2, { place: 'munich' })])

      // `name` then `name-parent`, the Atlas seed's own rule.
      expect(nodeFor(tree, 'taken', 'munich')).toMatchObject({ slug: 'munich-taken-germany' })
    })

    it('leaves an errored or duplicated row out of the tree entirely', async () => {
      const row = rowIn('skipped')
      const { tree, body } = await propose([
        row(2),
        row(3, { place: 'munich', errors: ['Could not find this address.'] }),
        row(4, { place: 'hamburg', duplicate: true }),
      ])

      expect(body).toMatchObject({ creating: 1 })
      expect(nodeFor(tree, 'skipped', 'munich')).toBeUndefined()
      expect(nodeFor(tree, 'skipped', 'hamburg')).toBeUndefined()
      expect(nodeFor(tree, 'skipped', 'berlin')?.lines).toEqual([2])
    })

    it('proposes a state layer the cities hang under, naming it from the ISO code', async () => {
      const row = rowIn('layer')
      // Eight cities across two subdivisions, which is what both thresholds ask
      // for. Only the endpoint supplies the country code the ISO names come
      // from, so this is what pins that it reached the decision.
      const spread = Array.from({ length: 8 }, (_, index) =>
        row(index + 2, {
          place: index < 4 ? 'munich' : 'berlin',
          nth: index,
          address: `Hauptstraße ${index}`,
        }),
      )

      const { tree } = await propose(spread)

      expect(tree.stateLayer).toMatchObject({ proposed: true })
      const states = tree.nodes.filter((node) => node.level === 'region')
      expect(states.map((state) => state.key).sort()).toEqual(['state:BE', 'state:BY'])
      // Named from ISO 3166-2, which only the target's country code reaches.
      expect(states.map((state) => state.name)).not.toContain('BE')
      // Parent-first, so the commit can create them in order.
      expect(tree.nodes.slice(0, states.length).every((node) => node.level === 'region')).toBe(true)

      const cities = tree.nodes.filter((node) => node.level === 'city')
      expect(cities).toHaveLength(8)
      expect(cities.every((city) => city.parentKey?.startsWith('state:'))).toBe(true)
    })

    it('proposes halls for a city target, and nothing for a single-use address', async () => {
      const row = rowIn('halls')
      // The fixture's default `mapboxId` is a `manual-` one, which is the
      // hand-located case: no feature to compare a row against, so the target
      // confines nothing and the Nuremberg row below would be accepted.
      const berlinCity = await testData.createRegion(payload, {
        name: cityName('halls', 'berlin'),
        level: 'city',
        parent: germany.id,
      })
      expect(berlinCity.mapboxId.startsWith('manual-')).toBe(true)

      const { tree } = await propose(
        [
          row(2, { address: 'Yogahaus 1', venueName: 'Yogahaus', addressId: 'mbx-halls-hall' }),
          row(3, { address: 'Yogahaus 1', venueName: 'Yogahaus', addressId: 'mbx-halls-hall' }),
          row(4, { address: 'A Private Flat 9' }),
          row(5, { place: 'munich', address: 'Elsewhere 5' }),
        ],
        { targetRegion: berlinCity.id },
      )

      expect(tree.rowErrors).toEqual([])
      expect(tree.nodes).toHaveLength(1)
      expect(tree.nodes[0]).toMatchObject({
        level: 'venue',
        name: 'Yogahaus',
        parentKey: null,
        lines: [2, 3],
      })
      // A city target groups nothing above its halls.
      expect(tree.stateLayer).toMatchObject({ proposed: false })
    })

    it('refuses a row that geocoded outside a city target, and keeps the rest', async () => {
      const row = rowIn('stray')
      // ⚠ A real Mapbox feature, not the fixture's `manual-` default: the
      // confinement is a feature comparison, so a hand-located target skips it.
      const pune = await testData.createRegion(payload, {
        name: cityName('stray', 'berlin'),
        level: 'city',
        parent: germany.id,
        mapboxId: placeId('stray', 'berlin'),
      })

      const { tree, body } = await propose(
        [
          row(2, { address: 'Yogahaus 1', addressId: 'mbx-stray-hall' }),
          row(3, { address: 'Yogahaus 1', addressId: 'mbx-stray-hall' }),
          // Nuremberg: the state confines it, the city does not, and nothing
          // below this endpoint ever asks.
          row(4, { place: 'munich', address: 'Fernab 4' }),
          row(5, { place: 'munich', address: 'Fernab 4' }),
        ],
        { targetRegion: pune.id },
      )

      expect(body).toMatchObject({ rowErrors: 2 })
      expect(tree.rowErrors.map((error) => error.line)).toEqual([4, 5])
      expect(tree.rowErrors[0]?.message).toContain(cityName('stray', 'berlin'))
      // The stray rows are out of the sizing too, so they cannot earn a hall.
      expect(tree.nodes).toHaveLength(1)
      expect(tree.nodes[0]).toMatchObject({ level: 'venue', lines: [2, 3] })
    })

    it('recomputes from scratch when called again', async () => {
      const row = rowIn('again')
      // The review re-sends rather than patches, so a second call has to pick up
      // a region created in between — the city this batch would have created.
      const batch = await createBatch({ rows: [row(2)], status: 'resolved' })
      const first = await call(uploader, batch.id)

      await testData.createRegion(payload, {
        name: cityName('again', 'berlin'),
        level: 'city',
        parent: germany.id,
        mapboxId: placeId('again', 'berlin'),
      })
      const second = await call(uploader, batch.id)

      expect(first.body).toMatchObject({ creating: 1, existing: 0 })
      expect(second.body).toMatchObject({ creating: 0, existing: 1 })
      expect(await storedTree(batch.id)).toEqual(second.body.proposedRegions)
    })
  })

  describe('what it refuses', () => {
    it('refuses a batch that has not finished resolving', async () => {
      const batch = await createBatch({ rows: [rowIn('pending')(2)] })

      const { status, body } = await call(uploader, batch.id)

      expect(status).toBe(409)
      expect(body).toMatchObject({ errors: [{ message: expect.stringContaining('Resolve') }] })
      expect(await storedTree(batch.id)).toBeFalsy()
    })

    it('refuses a batch mid-commit', async () => {
      const batch = await createBatch({ rows: [rowIn('mid')(2)], status: 'committing' })

      const { status, body } = await call(uploader, batch.id)

      expect(status).toBe(409)
      // Its own wording, not the "resolve first" 409: a committing batch is not
      // waiting for anything the reviewer can do.
      expect(body).toMatchObject({
        errors: [{ message: expect.stringContaining('being committed') }],
      })
    })

    it('refuses a venue target, which no city may hang under', async () => {
      const city = await testData.createRegion(payload, {
        name: cityName('venue', 'berlin'),
        level: 'city',
        parent: germany.id,
      })
      const hall = await testData.createRegion(payload, {
        name: 'A Hall venue',
        level: 'venue',
        parent: city.id,
      })
      const batch = await createBatch({
        rows: [rowIn('venue')(2)],
        status: 'resolved',
        targetRegion: hall.id,
      })

      const { status, body } = await call(uploader, batch.id)

      expect(status).toBe(422)
      expect(body).toMatchObject({ errors: [{ message: expect.stringContaining('venue') }] })
      expect(await storedTree(batch.id)).toBeFalsy()
    })

    it('refuses a manager who holds the batch but not the target region', async () => {
      // ⚠ The outsider has to be the uploader, or the collection's own `access`
      // answers 404 first and the subtree check never runs.
      const batch = await createBatch({
        rows: [rowIn('unowned')(2)],
        status: 'resolved',
        uploader: outsider.id,
      })

      const { status, body } = await call(outsider, batch.id)

      expect(status).toBe(403)
      expect(body).toMatchObject({ errors: [{ message: expect.stringContaining('manage') }] })
      expect(await storedTree(batch.id)).toBeFalsy()
    })

    it("hides somebody else's batch rather than refusing it", async () => {
      const batch = await createBatch({ rows: [rowIn('hidden')(2)], status: 'resolved' })

      expect((await call(outsider, batch.id)).status).toBe(404)
    })

    it('refuses an inactive manager and an API client', async () => {
      const batch = await createBatch({ rows: [rowIn('denied')(2)], status: 'resolved' })

      expect((await call(inactiveManager, batch.id)).status).toBe(403)
      expect((await call(client, batch.id)).status).toBe(403)
    })

    it('refuses an id Postgres could not hold, and one that is nobody’s batch', async () => {
      expect((await call(uploader, 1e30)).status).toBe(400)
      expect((await call(uploader, 99_999_999)).status).toBe(404)
    })
  })
})
