/**
 * The commit endpoint (#828, phase 6b): what it writes, and what it writes only
 * once.
 *
 * The four modules behind it are pinned by their own unit specs with every
 * argument handed in — placement, the region payload, the coordinator roster,
 * the event payload. This covers what none of those can see: that the three
 * steps happen in an order the database accepts, that a second call creates
 * nothing a first call already created, and that a row carrying its own id is
 * never offered again.
 *
 * ⚠ **Every test tags its own places, and nothing is deleted afterwards.** One
 * database serves the file, `Regions.mapboxId` and `Regions.slug` are both
 * unique collection-wide, and `event_imports.targetRegion` is `NOT NULL` — so a
 * region a batch points at cannot be cleaned up, and an untagged "Berlin" would
 * make the next test's commit adopt the last test's fixture.
 *
 * ⚠ **The anchor is deliberately in the past.** `mapCsvSchedule` resolves "the
 * next Tuesday" against it, so an anchor inside this week agrees with the wall
 * clock and an assertion about the first date proves nothing
 * (`tests/unit/event-import-event-data.spec.ts` carries the same note).
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { commitEventImport } from '@/collections/EventImports/endpoints/commit'
import { asLog } from '@/fields'
import type {
  Event,
  EventImport,
  EventImportProposedRegions,
  EventImportRows,
  Manager,
  Region,
} from '@/payload-types'

import { createData, testData, type FixtureOverrides } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

type Node = EventImportProposedRegions['nodes'][number]
type Row = EventImportRows[number]

const ANCHOR = '2026-01-05'

const PLACES = {
  berlin: { city: 'Berlin', latitude: 52.52, longitude: 13.405, state: 'BE' },
  munich: { city: 'Munich', latitude: 48.137, longitude: 11.575, state: 'BY' },
} as const

type PlaceName = keyof typeof PLACES

interface RowOptions {
  place?: PlaceName
  managerEmail?: string
  managerName?: string
  errors?: string[]
  duplicate?: boolean
  committed?: number
  values?: Record<string, string>
}

/** One row as the resolve step leaves it: an answer, and no reason it cannot have one. */
function row(line: number, options: RowOptions = {}): Row {
  const place = PLACES[options.place ?? 'berlin']
  return {
    line,
    values: {
      title: `Class ${line}`,
      eventType: 'offline',
      country: 'DE',
      city: place.city,
      address: `Oranienstraße ${line}`,
      scheduleType: 'weekly',
      startTime: '18:30',
      weekdays: 'TU',
      ...(options.managerEmail ? { managerEmail: options.managerEmail } : {}),
      ...(options.managerName ? { managerName: options.managerName } : {}),
      ...options.values,
    },
    ...(options.errors ? { errors: options.errors } : {}),
    ...(options.duplicate ? { duplicate: { reason: 'city-and-time' as const, line: 2 } } : {}),
    ...(options.committed ? { committed: { eventId: options.committed } } : {}),
    resolved: {
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: 'Europe/Berlin',
      cityKey: place.city.toLowerCase(),
      placeName: place.city,
      placeId: `place.${place.city.toLowerCase()}`,
      mapboxId: `address.${line}`,
      subdivisionCode: place.state,
      weekdayMask: 0b10,
      startMinutes: 1110,
      languages: ['de'],
      inactive: false,
      anchorDate: ANCHOR,
    },
  }
}

/** A `create` city node, tagged so two tests never propose the same feature. */
function cityNode(tag: string, options: { place?: PlaceName; lines: number[]; parentKey?: string }): Node {
  const place = PLACES[options.place ?? 'berlin']
  const slug = `${place.city.toLowerCase()}-${tag}`
  return {
    key: `city:id:mbx-${tag}-${place.city.toLowerCase()}`,
    level: 'city',
    name: `${place.city} ${tag}`,
    parentKey: options.parentKey ?? null,
    match: { kind: 'create' },
    slug,
    location: { kind: 'mapbox', mapboxId: `mbx-${tag}-${place.city.toLowerCase()}` },
    lines: options.lines,
  }
}

function tree(nodes: Node[], rowErrors: { line: number; message: string }[] = []): EventImportProposedRegions {
  return { nodes, rowErrors, stateLayer: { proposed: false, reason: 'one subdivision' } }
}

describe('commit endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let admin: Manager
  let uploader: Manager
  let outsider: Manager
  let germany: Region
  let austria: Region

  const reqAs = (user: Manager, id: number): PayloadRequest =>
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
    user: Manager,
    id: number,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = (await commitEventImport.handler(reqAs(user, id))) as Response
    return { status: response.status, body: (await response.json()) as Record<string, unknown> }
  }

  const createBatch = (overrides: FixtureOverrides<EventImport> = {}) =>
    payload.create({
      collection: 'event-imports',
      data: createData<'event-imports'>({
        targetRegion: germany.id,
        uploader: uploader.id,
        defaultLanguages: ['de'],
        status: 'resolved',
        ...overrides,
      }),
      overrideAccess: true,
    })

  const storedRows = async (id: number): Promise<Row[]> =>
    ((
      await payload.findByID({ collection: 'event-imports', id, depth: 0, overrideAccess: true })
    ).rows ?? []) as Row[]

  const storedStatus = async (id: number): Promise<string> =>
    (await payload.findByID({ collection: 'event-imports', id, depth: 0, overrideAccess: true }))
      .status

  const regionBySlug = async (slug: string): Promise<Region | undefined> =>
    (
      await payload.find({
        collection: 'regions',
        where: { slug: { equals: slug } },
        depth: 0,
        overrideAccess: true,
      })
    ).docs[0] as Region | undefined

  const eventOf = (row: Row | undefined): Promise<Event> => {
    if (!row?.committed) throw new Error(`line ${row?.line} committed nothing`)
    return payload.findByID({
      collection: 'events',
      id: row.committed.eventId,
      depth: 0,
      overrideAccess: true,
    }) as Promise<Event>
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    admin = env.adminUser

    uploader = await testData.createManager(payload, {
      name: 'Commit Uploader',
      email: 'commit-uploader@example.com',
      roles: ['atlas-manager'],
    })
    outsider = await testData.createManager(payload, {
      name: 'Commit Outsider',
      email: 'commit-outsider@example.com',
      roles: ['atlas-manager'],
    })

    // ⚠ The name is the fixture: the country code is read off the chain, so a
    // region called "Test Country" matches no ISO country and every batch under
    // it is refused before anything is written.
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

  describe('the regions it creates', () => {
    it('creates a proposed city under the target and files its classes there', async () => {
      const batch = await createBatch({
        rows: [row(2), row(3)],
        proposedRegions: tree([cityNode('mk', { lines: [2, 3] })]),
      })

      const { status, body } = await call(uploader, batch.id)

      expect(status).toBe(200)
      expect(body).toMatchObject({ regions: { created: 1, adopted: 0, failed: 0 }, done: true })
      const berlin = await regionBySlug('berlin-mk')
      expect(berlin).toMatchObject({ level: 'city', name: 'Berlin mk' })
      expect(berlin?.parent).toBe(germany.id)
      const rows = await storedRows(batch.id)
      expect((await eventOf(rows[0])).region).toBe(berlin?.id)
      expect((await eventOf(rows[1])).region).toBe(berlin?.id)
    })

    it('creates nothing for a node the Atlas already holds', async () => {
      const held = await testData.createRegion(payload, {
        name: 'Berlin hd',
        level: 'city',
        parent: germany.id,
        mapboxId: 'mbx-hd-berlin',
      })
      const node: Node = {
        ...cityNode('hd', { lines: [2] }),
        match: { kind: 'existing', regionId: held.id, name: 'Berlin hd', slug: held.slug },
        slug: null,
        location: null,
      }
      const batch = await createBatch({ rows: [row(2)], proposedRegions: tree([node]) })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ regions: { created: 0, adopted: 0, failed: 0 } })
      expect((await eventOf((await storedRows(batch.id))[0])).region).toBe(held.id)
    })

    /**
     * ⚠ **The assertion the whole resume design rests on.** Nothing records the
     * regions a commit created, so a re-fired commit has to find them by the id
     * `plannedMapboxId` recomputes — otherwise it writes a second Berlin under a
     * fresh slug and splits the batch's classes between the two.
     */
    it('adopts the region its own earlier call created, rather than a second one', async () => {
      const nodes = [cityNode('rf', { lines: [2] })]
      const batch = await createBatch({ rows: [row(2)], proposedRegions: tree(nodes) })

      const first = await call(uploader, batch.id)
      // Clear the row's id so the second call re-offers it, which is what an
      // interrupted write leaves behind: the region landed, the row did not.
      const rows = await storedRows(batch.id)
      const eventId = rows[0]!.committed!.eventId
      await payload.update({
        collection: 'event-imports',
        id: batch.id,
        data: { rows: [row(2)] },
        overrideAccess: true,
      })

      const second = await call(uploader, batch.id)

      expect(first.body).toMatchObject({ regions: { created: 1, adopted: 0 } })
      expect(second.body).toMatchObject({ regions: { created: 0, adopted: 1 } })
      const berlins = await payload.find({
        collection: 'regions',
        where: { slug: { like: 'berlin-rf' } },
        depth: 0,
        overrideAccess: true,
      })
      expect(berlins.totalDocs).toBe(1)
      expect((await eventOf((await storedRows(batch.id))[0])).region).toBe(berlins.docs[0]!.id)
      // The first call's class is still there — the second created another,
      // which is exactly what `committed` exists to prevent.
      expect(await eventOf(row(2, { committed: eventId }))).toBeTruthy()
    })

    /**
     * A state layer carries every line of every city under it
     * (`propose/tree.ts`), so the shallowest match is almost always wrong.
     */
    it('files a class under the deepest node holding its line', async () => {
      const state: Node = {
        key: 'state:BE',
        level: 'region',
        name: 'Berlin State dp',
        parentKey: null,
        match: { kind: 'create' },
        slug: 'berlin-state-dp',
        location: { kind: 'manual', latitude: 52.5, longitude: 13.4, radius: 50_000 },
        lines: [2],
      }
      const city = cityNode('dp', { lines: [2], parentKey: 'state:BE' })
      const batch = await createBatch({ rows: [row(2)], proposedRegions: tree([state, city]) })

      await call(uploader, batch.id)

      const stateRegion = await regionBySlug('berlin-state-dp')
      const cityRegion = await regionBySlug('berlin-dp')
      expect(cityRegion?.parent).toBe(stateRegion?.id)
      expect((await eventOf((await storedRows(batch.id))[0])).region).toBe(cityRegion?.id)
    })

    it('reports the rows of a node it could not create, and creates no class for them', async () => {
      // The slug is spent between the review and the commit, which is the
      // failure this path exists for.
      await testData.createRegion(payload, { name: 'Squatter', slug: 'berlin-sq' })
      const batch = await createBatch({
        rows: [row(2)],
        proposedRegions: tree([cityNode('sq', { lines: [2] })]),
      })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ regions: { created: 0, failed: 1 }, done: true })
      const stored = (await storedRows(batch.id))[0]!
      expect(stored.committed).toBeUndefined()
      // The node's own name, and the reason as `Regions` gave it — a volunteer
      // has to be told which proposed city, not which row id.
      expect(stored.errors?.[0]).toContain('Berlin sq could not be created')
      expect(stored.errors?.[0]).toContain('slug is already in use')
    })
  })

  describe('the coordinators it names', () => {
    it('publishes a row with no coordinator as unverified, with no manager', async () => {
      const batch = await createBatch({
        rows: [row(2)],
        proposedRegions: tree([cityNode('uv', { lines: [2] })]),
      })

      await call(uploader, batch.id)

      const event = await eventOf((await storedRows(batch.id))[0])
      expect(event).toMatchObject({
        _status: 'published',
        verificationStage: 'unverified',
        manager: null,
      })
      // ⚠ **Null is the accepted answer here, not a gap** — an open-ended
      // recurring listing nobody has adopted never comes up for expiry
      // (`src/lib/eventVerification/watermark.ts`, #828). Pinned so that making
      // these listings expire has to be a deliberate change. That the
      // pre-adoption branch ran is what the adopted row's own case shows, by
      // contrast: it gets a date.
      expect(event.nextCheckAt).toBeNull()
    })

    it('adopts a row naming an existing coordinator, and verifies the class', async () => {
      const coordinator = await testData.createManager(payload, {
        name: 'Existing Coordinator',
        email: 'commit-existing@example.com',
      })
      const batch = await createBatch({
        // Mixed case on purpose: Payload lowercases a stored address, so a
        // case-sensitive match would create a duplicate the unique index refuses.
        rows: [row(2, { managerEmail: 'Commit-Existing@Example.com' })],
        proposedRegions: tree([cityNode('ad', { lines: [2] })]),
      })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ coordinators: { matched: 1, created: 0, refused: 0 } })
      const event = await eventOf((await storedRows(batch.id))[0])
      expect(event.manager).toBe(coordinator.id)
      expect(event.verificationStage).toBe('verified')
      expect(event.nextCheckAt).toBeTruthy()
    })

    it('creates an account for an unknown coordinator, with no roles and no admin type', async () => {
      const batch = await createBatch({
        rows: [row(2, { managerEmail: 'commit-new@example.com', managerName: 'New Coordinator' })],
        proposedRegions: tree([cityNode('nw', { lines: [2] })]),
      })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ coordinators: { matched: 0, created: 1, refused: 0 } })
      const created = (
        await payload.find({
          collection: 'managers',
          where: { email: { equals: 'commit-new@example.com' } },
          depth: 0,
          overrideAccess: true,
        })
      ).docs[0] as Manager | undefined
      expect(created).toMatchObject({ name: 'New Coordinator', type: 'manager' })
      expect(created?.roles ?? null).toBeFalsy()
      // An invited account is unverified by definition (#664), and nothing here
      // marks it otherwise.
      expect(created?._verified ?? false).toBe(false)
      expect((await eventOf((await storedRows(batch.id))[0])).manager).toBe(created?.id)
    })

    it('gives two rows naming one address a single account', async () => {
      const batch = await createBatch({
        rows: [
          row(2, { managerEmail: 'commit-shared@example.com', managerName: 'Shared' }),
          row(3, { managerEmail: 'commit-shared@example.com' }),
        ],
        proposedRegions: tree([cityNode('sh', { lines: [2, 3] })]),
      })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ coordinators: { created: 1 } })
      const rows = await storedRows(batch.id)
      const managers = await Promise.all(rows.map(async (r) => (await eventOf(r)).manager))
      expect(managers[0]).toBe(managers[1])
    })

    it('reports a row whose coordinator address cannot hold an account', async () => {
      const batch = await createBatch({
        rows: [row(2, { managerEmail: 'not-an-address' })],
        proposedRegions: tree([cityNode('bad', { lines: [2] })]),
      })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ coordinators: { refused: 1 } })
      const stored = (await storedRows(batch.id))[0]!
      expect(stored.committed).toBeUndefined()
      expect(stored.errors?.length).toBeGreaterThan(0)
    })
  })

  describe('which rows it writes', () => {
    it('skips a row carrying an error, a match, or the proposal’s own refusal', async () => {
      const batch = await createBatch({
        rows: [
          row(2),
          row(3, { errors: ['could not find this location'] }),
          row(4, { duplicate: true }),
          row(5, { place: 'munich' }),
        ],
        proposedRegions: tree(
          [cityNode('sk', { lines: [2] })],
          [{ line: 5, message: 'This address is not in Berlin sk.' }],
        ),
      })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({
        rows: { total: 4, committed: 1, duplicates: 1, errors: 2 },
        done: true,
      })
      const rows = await storedRows(batch.id)
      expect(rows.filter((r) => r.committed)).toHaveLength(1)
      // The proposal's reason is now on the row, which is what the next chunk reads.
      expect(rows[3]?.errors).toEqual(['This address is not in Berlin sk.'])
    })

    /**
     * ⚠ **Resumption, end to end.** A row that already carries an id must not be
     * written again, and the response has to stop reporting work left.
     */
    it('creates nothing on a second call, and reports done', async () => {
      const batch = await createBatch({
        rows: [row(2), row(3)],
        proposedRegions: tree([cityNode('rs', { lines: [2, 3] })]),
      })

      const first = await call(uploader, batch.id)
      const ids = (await storedRows(batch.id)).map((r) => r.committed?.eventId)
      const second = await call(uploader, batch.id)

      expect(first.body).toMatchObject({ committedNow: 2, pending: 0, done: true })
      expect(second.body).toMatchObject({ committedNow: 0, pending: 0, done: true })
      expect((await storedRows(batch.id)).map((r) => r.committed?.eventId)).toEqual(ids)
      const berlinEvents = await payload.find({
        collection: 'events',
        where: { region: { equals: (await regionBySlug('berlin-rs'))!.id } },
        depth: 0,
        overrideAccess: true,
      })
      expect(berlinEvents.totalDocs).toBe(2)
    })

    /**
     * ⚠ **The column holds a bare string, and `firstDate_tz` holds an enum.** A
     * zone dropped from the enum between the resolve and the commit has to name
     * the line, not the column — Postgres would name the column.
     */
    it('reports a row whose timezone the enum no longer carries', async () => {
      const stale = row(2)
      stale.resolved!.timezone = 'Mars/Olympus'
      const batch = await createBatch({
        rows: [stale],
        proposedRegions: tree([cityNode('tz', { lines: [2] })]),
      })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ rows: { committed: 0, errors: 1 } })
      expect((await storedRows(batch.id))[0]?.errors?.[0]).toContain('timezone')
    })

    /**
     * ⚠ **A country cannot hold a class.** `Events.region` is a city or a venue,
     * so a row the proposal placed in no node must be told so against its line
     * rather than refused by that field, which answers with a row id.
     */
    it('reports a row no proposed node holds, under a country target', async () => {
      const batch = await createBatch({
        rows: [row(2), row(3)],
        proposedRegions: tree([cityNode('nn', { lines: [3] })]),
      })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ rows: { committed: 1, errors: 1 } })
      expect((await storedRows(batch.id))[0]?.errors?.[0]).toContain('no proposed city')
    })

    it('writes the class the CSV described, with the batch’s languages and the reviewed first date', async () => {
      const batch = await createBatch({
        rows: [row(2, { values: { venueName: 'Community Hall', website: 'https://example.org' } })],
        proposedRegions: tree([cityNode('dt', { lines: [2] })]),
      })

      await call(uploader, batch.id)

      const event = await eventOf((await storedRows(batch.id))[0])
      expect(event).toMatchObject({
        title: 'Class 2',
        eventType: 'offline',
        languages: ['de'],
        registrationMode: 'sahaj-atlas',
        inactive: false,
        website: 'https://example.org',
      })
      expect(event.address).toMatchObject({
        street: 'Oranienstraße 2',
        city: 'Berlin',
        country: 'DE',
        region: 'BE',
        venueName: 'Community Hall',
      })
      // The next Tuesday after the stored anchor, not after today.
      expect(event.schedule?.firstDate?.startsWith('2026-01-06')).toBe(true)
      expect(event.schedule?.firstDate_tz).toBe('Europe/Berlin')
    })
  })

  describe('provenance', () => {
    /**
     * The batch is hard-deleted the moment the commit finishes, so this entry is
     * the whole record of who imported the class (`EventImports.ts`).
     *
     * ⚠ **Both arms, because they reach the log differently.** An adopted class
     * has its log replaced by `syncVerificationOnSave`, so an entry written with
     * the create survives on an unadopted class and vanishes on an adopted one.
     */
    it('names the uploader and the CSV line on every class it creates', async () => {
      const batch = await createBatch({
        rows: [row(2), row(3, { managerEmail: 'commit-prov@example.com' })],
        proposedRegions: tree([cityNode('pv', { lines: [2, 3] })]),
      })

      await call(uploader, batch.id)

      const rows = await storedRows(batch.id)
      for (const stored of rows) {
        const log = asLog((await eventOf(stored)).activityLog)
        expect(log.find((entry) => entry.type === 'event-import')).toMatchObject({
          key: `${batch.id}:${stored.line}`,
          cells: { who: 'Commit Uploader', delivery: `Bulk import, CSV line ${stored.line}` },
        })
      }
      // The adopted class keeps its verification entry beside the import one.
      expect(
        asLog((await eventOf(rows[1])).activityLog).map((entry) => entry.type),
      ).toContain('verification')
    })

  })

  describe('what it refuses', () => {
    it('moves a resolved batch to committing before it writes anything', async () => {
      const batch = await createBatch({
        rows: [row(2)],
        proposedRegions: tree([cityNode('st', { lines: [2] })]),
      })

      await call(uploader, batch.id)

      // Not `resolved` once the commit has started: the resolve and propose
      // endpoints refuse this status, so the tree cannot move underneath it.
      expect(await storedStatus(batch.id)).toBe('committing')
    })

    it('refuses a batch that has not resolved', async () => {
      const batch = await createBatch({ status: 'uploaded', rows: [row(2)] })

      const { status, body } = await call(uploader, batch.id)

      expect(status).toBe(409)
      expect(JSON.stringify(body)).toContain('Resolve the batch')
    })

    it('refuses a resolved batch with no proposed tree', async () => {
      const batch = await createBatch({ rows: [row(2)] })

      const { status, body } = await call(uploader, batch.id)

      expect(status).toBe(409)
      expect(JSON.stringify(body)).toContain('Propose the batch regions')
    })

    /**
     * ⚠ **The batch is the caller's own.** Pointing it at somebody else's region
     * instead is what reaches the subtree check — a batch belonging to another
     * manager is refused by the collection's `read` first, with a 404, and the
     * check never runs.
     */
    it('refuses a target outside the caller’s subtree', async () => {
      const batch = await createBatch({
        targetRegion: austria.id,
        rows: [row(2)],
        proposedRegions: tree([cityNode('os', { lines: [2] })]),
      })

      const { status } = await call(uploader, batch.id)

      expect(status).toBe(403)
      expect(await regionBySlug('berlin-os')).toBeUndefined()
      expect(await storedStatus(batch.id)).toBe('resolved')
    })

    it('refuses a batch id that is not a batch', async () => {
      expect((await call(uploader, 99_999_999)).status).toBe(404)
      expect((await call(uploader, 0)).status).toBe(400)
    })

    it('refuses a tree whose nodes are not parent-first', async () => {
      const city = cityNode('pf', { lines: [2], parentKey: 'state:LATE' })
      const late: Node = {
        key: 'state:LATE',
        level: 'region',
        name: 'Late State pf',
        parentKey: null,
        match: { kind: 'create' },
        slug: 'late-state-pf',
        location: { kind: 'manual', latitude: 52.5, longitude: 13.4, radius: 50_000 },
        lines: [2],
      }
      const batch = await createBatch({
        rows: [row(2)],
        proposedRegions: tree([city, late]),
      })

      const { status, body } = await call(uploader, batch.id)

      expect(status).toBe(422)
      expect(JSON.stringify(body)).toContain('cannot be committed')
      // Nothing was written, which is the point of refusing rather than failing
      // each row — a city created under a state that does not exist yet is a
      // foreign-key error naming neither node.
      expect(await regionBySlug('berlin-pf')).toBeUndefined()
      expect((await storedRows(batch.id))[0]?.committed).toBeUndefined()
      // ⚠ **Still `resolved`, which is what makes the refusal actionable.**
      // `committing` is a one-way door — resolve and propose both refuse it — so
      // moving the status first would brick the batch while telling the
      // volunteer to propose it again.
      expect(await storedStatus(batch.id)).toBe('resolved')
    })

    it('lets an admin commit somebody else’s batch, naming the uploader', async () => {
      const batch = await createBatch({
        rows: [row(2)],
        proposedRegions: tree([cityNode('aw', { lines: [2] })]),
      })

      const { status } = await call(admin, batch.id)

      expect(status).toBe(200)
      const log = asLog((await eventOf((await storedRows(batch.id))[0])).activityLog)
      expect(log.find((entry) => entry.type === 'event-import')?.cells.who).toBe('Commit Uploader')
    })
  })
})
