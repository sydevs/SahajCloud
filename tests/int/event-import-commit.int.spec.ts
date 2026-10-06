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

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { COMMIT_CHUNK_ROWS } from '@/collections/EventImports/constants'
import { commitEventImport } from '@/collections/EventImports/endpoints/commit'
import { asLog } from '@/fields'
import { CONTACT_EMAIL } from '@/lib/contact'
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

interface Finished {
  committed: { line: number; eventId: number; action: 'created' | 'overwrote' }[]
  skipped: { line: number; reasons: string[]; values: Record<string, string> }[]
  summaryEmailed: boolean
  reportEmailed: boolean
}

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

/**
 * Every row a hall of its own, kilometres from any other.
 *
 * ⚠ **The commit re-asks the duplicate question of every row it writes**,
 * against every class already in the target — and one database serves the
 * whole file, so two tests' Tuesday 18:30 classes at one point would read as one
 * class, and the second test would skip its own row.
 */
let hallSerial = 0

/** One row as the resolve step leaves it: an answer, and no reason it cannot have one. */
function row(line: number, options: RowOptions = {}): Row {
  const place = PLACES[options.place ?? 'berlin']
  const hall = (hallSerial += 1)
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
      latitude: place.latitude + hall * 0.02,
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
function cityNode(
  tag: string,
  options: { place?: PlaceName; lines: number[]; parentKey?: string },
): Node {
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

/**
 * One line more than a chunk holds, so a commit over them cannot finish in one
 * call — which is the only way a second call reaches a batch that still exists.
 */
function chunkCrossingLines(): number[] {
  return Array.from({ length: COMMIT_CHUNK_ROWS + 1 }, (_, index) => index + 2)
}

function tree(
  nodes: Node[],
  rowErrors: { line: number; message: string }[] = [],
): EventImportProposedRegions {
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
      await payload.findByID({
        collection: 'event-imports',
        id,
        depth: 0,
        overrideAccess: true,
        trash: true,
      })
    ).rows ?? []) as Row[]

  const storedStatus = async (id: number): Promise<string> =>
    (
      await payload.findByID({
        collection: 'event-imports',
        id,
        depth: 0,
        overrideAccess: true,
        trash: true,
      })
    ).status

  const regionBySlug = async (slug: string): Promise<Region | undefined> =>
    (
      await payload.find({
        collection: 'regions',
        where: { slug: { equals: slug } },
        depth: 0,
        overrideAccess: true,
      })
    ).docs[0] as Region | undefined

  const eventById = (id: number): Promise<Event> =>
    payload.findByID({
      collection: 'events',
      id,
      depth: 0,
      overrideAccess: true,
    }) as Promise<Event>

  /**
   * The report a finished commit returns.
   *
   * ⚠ **This is where a completed batch is read, not `storedRows`.** The finish
   * strips the CSV values from every committed row, so the report that travelled
   * back in the response is the account of what each line did. `storedRows` is
   * for a call that refused, or one that stopped part-way through the chunks.
   */
  const finishedOf = (body: Record<string, unknown>): Finished => {
    const finished = body.finished as Finished | undefined
    if (!finished) throw new Error('this call did not finish the batch')
    return finished
  }

  const eventAtLine = (body: Record<string, unknown>, line: number): Promise<Event> => {
    const entry = finishedOf(body).committed.find((row) => row.line === line)
    if (!entry) throw new Error(`line ${line} committed nothing`)
    return eventById(entry.eventId)
  }

  const reasonsAtLine = (body: Record<string, unknown>, line: number): string[] =>
    finishedOf(body).skipped.find((row) => row.line === line)?.reasons ?? []

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
      expect((await eventAtLine(body, 2)).region).toBe(berlin?.id)
      expect((await eventAtLine(body, 3)).region).toBe(berlin?.id)
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
      expect((await eventAtLine(body, 2)).region).toBe(held.id)
    })

    /**
     * ⚠ **The assertion the whole resume design rests on.** Nothing records the
     * regions a commit created, so the call that picks the batch up again has to
     * find them by the id `plannedMapboxId` recomputes — otherwise it writes a
     * second Berlin under a fresh slug and splits the batch's classes between
     * the two.
     *
     * A batch one row past `COMMIT_CHUNK_ROWS` is what makes the second call
     * reachable: the first leaves the batch `committing`, and only the last call
     * runs the finish that deletes it.
     */
    it('adopts the region its first chunk created, and writes each row once', async () => {
      const lines = chunkCrossingLines()
      const batch = await createBatch({
        rows: lines.map((line) => row(line)),
        proposedRegions: tree([cityNode('rf', { lines })]),
      })

      const first = await call(uploader, batch.id)
      const second = await call(uploader, batch.id)

      expect(first.body).toMatchObject({
        regions: { created: 1, adopted: 0 },
        committedNow: COMMIT_CHUNK_ROWS,
        pending: 1,
        done: false,
      })
      expect(first.body.finished).toBeUndefined()
      expect(second.body).toMatchObject({
        regions: { created: 0, adopted: 1 },
        committedNow: 1,
        pending: 0,
        done: true,
      })

      const berlins = await payload.find({
        collection: 'regions',
        where: { slug: { like: 'berlin-rf' } },
        depth: 0,
        overrideAccess: true,
      })
      expect(berlins.totalDocs).toBe(1)
      // One class per line and no more: the ids the first chunk wrote are what
      // stopped the second call offering those rows again.
      const committed = finishedOf(second.body).committed
      expect(committed.map((entry) => entry.line)).toEqual(lines)
      expect(new Set(committed.map((entry) => entry.eventId)).size).toBe(lines.length)
      const classes = await payload.count({
        collection: 'events',
        where: { region: { equals: berlins.docs[0]!.id } },
        overrideAccess: true,
      })
      expect(classes.totalDocs).toBe(lines.length)
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

      const { body } = await call(uploader, batch.id)

      const stateRegion = await regionBySlug('berlin-state-dp')
      const cityRegion = await regionBySlug('berlin-dp')
      expect(cityRegion?.parent).toBe(stateRegion?.id)
      expect((await eventAtLine(body, 2)).region).toBe(cityRegion?.id)
    })

    /**
     * ⚠ **A slug spent between the review and the commit is recovered.** Failing
     * the node failed every row in it, on a batch that can no longer be
     * proposed again.
     */
    it('re-slugs a node whose slug was taken since the review', async () => {
      await testData.createRegion(payload, { name: 'Squatter', slug: 'berlin-sq' })
      const batch = await createBatch({
        rows: [row(2)],
        proposedRegions: tree([cityNode('sq', { lines: [2] })]),
      })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ regions: { created: 1, failed: 0 }, done: true })
      const created = await regionBySlug('berlin-sq-2')
      expect(created).toMatchObject({ name: 'Berlin sq', parent: germany.id })
      expect((await eventAtLine(body, 2)).region).toBe(created?.id)
    })

    /**
     * ⚠ **A region holding the planned feature outside the target is not
     * adopted.** Created since the review — by an admin, or another region's
     * batch — it would file this batch's classes outside the region it was
     * aimed at.
     */
    it('reports the rows of a node a region elsewhere now stands for, and files nothing', async () => {
      await testData.createRegion(payload, {
        name: 'Elsewhere',
        level: 'city',
        parent: austria.id,
        mapboxId: 'mbx-ex-berlin',
      })
      const batch = await createBatch({
        rows: [row(2)],
        proposedRegions: tree([cityNode('ex', { lines: [2] })]),
      })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ regions: { created: 0, failed: 1 }, done: true })
      expect(finishedOf(body).committed).toEqual([])
      // The node's own name, and why — a volunteer has to be told which
      // proposed city, not which row id.
      expect(reasonsAtLine(body, 2)[0]).toContain('Berlin ex could not be created')
      expect(reasonsAtLine(body, 2)[0]).toContain('elsewhere in the Atlas')
    })

    /**
     * ⚠ **A region the review matched, moved out of the target since, is not
     * followed.** An admin's commit meets no subtree scoping on its writes.
     */
    it('refuses a matched region that has left the target, even for an admin', async () => {
      const moved = await testData.createRegion(payload, {
        name: 'Berlin mv',
        level: 'city',
        parent: austria.id,
        mapboxId: 'mbx-mv-berlin',
      })
      const node: Node = {
        ...cityNode('mv', { lines: [2] }),
        match: { kind: 'existing', regionId: moved.id, name: 'Berlin mv', slug: moved.slug },
        slug: null,
        location: null,
      }
      const batch = await createBatch({ rows: [row(2)], proposedRegions: tree([node]) })

      const { body } = await call(admin, batch.id)

      expect(finishedOf(body).committed).toEqual([])
      expect(reasonsAtLine(body, 2)[0]).toContain('no longer inside the region')
    })
  })

  describe('the coordinators it names', () => {
    it('publishes a row with no coordinator as unverified, with no manager', async () => {
      const batch = await createBatch({
        rows: [row(2)],
        proposedRegions: tree([cityNode('uv', { lines: [2] })]),
      })

      const { body } = await call(uploader, batch.id)

      const event = await eventAtLine(body, 2)
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

    it('adopts a row naming a coordinator already in the target, and verifies the class', async () => {
      const coordinator = await testData.createManager(payload, {
        name: 'Existing Coordinator',
        email: 'commit-existing@example.com',
      })
      // What makes the account one an import may link: it already looks after
      // something inside the target.
      await testData.createRegion(payload, {
        name: 'Berlin co',
        level: 'city',
        parent: germany.id,
        managers: [coordinator.id],
      })
      const batch = await createBatch({
        // Mixed case on purpose: Payload lowercases a stored address, so a
        // case-sensitive match would create a duplicate the unique index refuses.
        rows: [row(2, { managerEmail: 'Commit-Existing@Example.com' })],
        proposedRegions: tree([cityNode('ad', { lines: [2] })]),
      })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ coordinators: { matched: 1, created: 0, unlinked: 0 } })
      const event = await eventAtLine(body, 2)
      expect(event.manager).toBe(coordinator.id)
      expect(event.verificationStage).toBe('verified')
      expect(event.nextCheckAt).toBeTruthy()
    })

    /**
     * ⚠ **A CSV must not make an admin, or anybody outside the target, the
     * vouching coordinator of a class.** Their class is imported without one,
     * and the row says why.
     */
    it('links no account from outside the target, an admin’s included', async () => {
      const elsewhere = await testData.createManager(payload, {
        name: 'Elsewhere Coordinator',
        email: 'commit-elsewhere@example.com',
      })
      await testData.createRegion(payload, {
        name: 'Graz el',
        level: 'city',
        parent: austria.id,
        managers: [elsewhere.id],
      })
      const batch = await createBatch({
        rows: [
          row(2, { managerEmail: 'commit-elsewhere@example.com' }),
          row(3, { managerEmail: admin.email! }),
        ],
        proposedRegions: tree([cityNode('el', { lines: [2, 3] })]),
      })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ coordinators: { matched: 0, created: 0, unlinked: 2 } })
      for (const line of [2, 3]) {
        const event = await eventAtLine(body, line)
        expect(event).toMatchObject({ manager: null, verificationStage: 'unverified' })
      }
    })

    it('creates an account for an unknown coordinator, with no roles and no admin type', async () => {
      const batch = await createBatch({
        rows: [row(2, { managerEmail: 'commit-new@example.com', managerName: 'New Coordinator' })],
        proposedRegions: tree([cityNode('nw', { lines: [2] })]),
      })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ coordinators: { matched: 0, created: 1, unlinked: 0 } })
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
      expect((await eventAtLine(body, 2)).manager).toBe(created?.id)
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
      const managers = await Promise.all(
        [2, 3].map(async (line) => (await eventAtLine(body, line)).manager),
      )
      expect(managers[0]).toBe(managers[1])
    })

    /**
     * The upload refuses a malformed address before review (`csv/fieldChecks.ts`);
     * one that still reaches the commit costs the coordinator, not the class.
     */
    it('imports a class whose coordinator address cannot hold an account, without one', async () => {
      const batch = await createBatch({
        rows: [row(2, { managerEmail: 'not-an-address' })],
        proposedRegions: tree([cityNode('bad', { lines: [2] })]),
      })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ coordinators: { unlinked: 1 } })
      expect((await eventAtLine(body, 2)).manager).toBeNull()
      const stored = await payload.findByID({
        collection: 'event-imports',
        id: batch.id,
        trash: true,
        overrideAccess: true,
      })
      expect((stored.rows ?? [])[0]?.warnings?.[0]).toContain('imported without a coordinator')
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
      expect(finishedOf(body).committed.map((entry) => entry.line)).toEqual([2])
      // Every skip reaches the line it belongs to — the proposal's own refusal
      // included, which nothing else records.
      expect(reasonsAtLine(body, 3)).toEqual(['could not find this location'])
      expect(reasonsAtLine(body, 4)).toEqual(['a repeat of line 2'])
      expect(reasonsAtLine(body, 5)).toEqual(['This address is not in Berlin sk.'])
    })

    /**
     * ⚠ **A lost final response is not a lost report.** The finish trashes the
     * batch as its report, so a caller that asks again hears the same answer —
     * not a 404, and not a fresh commit that created nothing — and the CSV
     * values of every committed line are gone from it.
     */
    it('answers a repeat call with the same report, and keeps no committed line’s values', async () => {
      const batch = await createBatch({
        rows: [row(2), row(3)],
        proposedRegions: tree([cityNode('rs', { lines: [2, 3] })]),
      })

      const first = await call(uploader, batch.id)
      const second = await call(uploader, batch.id)

      expect(first.body).toMatchObject({ committedNow: 2, pending: 0, done: true })
      expect(second.status).toBe(200)
      expect(second.body).toMatchObject({ done: true, replayed: true })
      expect(finishedOf(second.body).committed).toEqual(finishedOf(first.body).committed)
      expect(await storedStatus(batch.id)).toBe('finished')
      expect((await storedRows(batch.id)).map((stored) => stored.values)).toEqual([{}, {}])
      const berlinEvents = await payload.count({
        collection: 'events',
        where: { region: { equals: (await regionBySlug('berlin-rs'))!.id } },
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
      expect(reasonsAtLine(body, 2)[0]).toContain('timezone')
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
      expect(reasonsAtLine(body, 2)[0]).toContain('no proposed city')
    })

    it('writes the class the CSV described, with the batch’s languages and the reviewed first date', async () => {
      const batch = await createBatch({
        rows: [row(2, { values: { venueName: 'Community Hall', website: 'https://example.org' } })],
        proposedRegions: tree([cityNode('dt', { lines: [2] })]),
      })

      const { body } = await call(uploader, batch.id)

      const event = await eventAtLine(body, 2)
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
     * The batch loses its CSV values the moment the commit finishes, so this entry is
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

      const { body } = await call(uploader, batch.id)

      for (const line of [2, 3]) {
        const log = asLog((await eventAtLine(body, line)).activityLog)
        expect(log.find((entry) => entry.type === 'event-import')).toMatchObject({
          key: `${batch.id}:${line}`,
          cells: {
            who: `Commit Uploader (#${uploader.id})`,
            delivery: `Bulk import, CSV line ${line}`,
          },
          uploaderId: uploader.id,
        })
      }
      // The adopted class keeps its verification entry beside the import one.
      expect(asLog((await eventAtLine(body, 3)).activityLog).map((entry) => entry.type)).toContain(
        'verification',
      )
    })
  })

  /**
   * The finish (#828, phase 6c): what the last call does besides writing the
   * last class.
   *
   * ⚠ **The caches are not asserted here, and cannot be.** Both invalidations
   * are fire-and-forget side effects of a deployment this lane does not have —
   * the Cloudflare purge is inert without credentials, and `revalidateTag`
   * throws outside a Next request scope and is swallowed. What *is* assertable
   * is the gate that defers them, and `tests/unit/cache-defer.spec.ts` holds it.
   */
  describe('the finish', () => {
    let sendEmail: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      sendEmail = vi.spyOn(payload, 'sendEmail').mockResolvedValue(undefined as never)
    })

    afterEach(() => {
      sendEmail.mockRestore()
    })

    const lastMessage = (): { to: string[]; subject: string; html: string } =>
      sendEmail.mock.calls.at(-1)?.[0] as never

    /** Every message sent to these addresses, in order. */
    const messagesTo = (address: string): { to: string[]; subject: string; html: string }[] =>
      (sendEmail.mock.calls as unknown[][])
        .map((call) => call[0] as { to: string[]; subject: string; html: string })
        .filter((message) => message.to.includes(address))

    it('sends admins exactly one summary of what the batch did', async () => {
      const batch = await createBatch({
        rows: [
          row(2),
          row(3, { managerEmail: 'commit-summary@example.com' }),
          // Names a coordinator the commit never looks up: a duplicate row is
          // not one it writes.
          row(4, { duplicate: true, managerEmail: 'commit-dupe@example.com' }),
        ],
        proposedRegions: tree([cityNode('sm', { lines: [2, 3, 4] })]),
      })

      const { body } = await call(uploader, batch.id)

      // One to the admins, and the uploader's own report.
      expect(sendEmail).toHaveBeenCalledTimes(2)
      expect(finishedOf(body).summaryEmailed).toBe(true)
      expect(messagesTo(admin.email!)).toHaveLength(1)
      const message = messagesTo(admin.email!)[0]!
      expect(message.to).toEqual([admin.email])
      expect(message.subject).toBe('2 classes imported into Germany')
      expect(message.html).toContain('Commit Uploader')
      // One coordinator, counted off the rows the commit actually ensured
      // accounts for — so the duplicate's address is not among them, and the
      // created count beside it covers the same set.
      expect(message.html.replace(/<!-- -->/g, '')).toContain('1 (1 new account)')
    })

    it('reports an undelivered summary instead of keeping the batch', async () => {
      sendEmail.mockRejectedValue(new Error('no transport'))
      const batch = await createBatch({
        rows: [row(2)],
        proposedRegions: tree([cityNode('ue', { lines: [2] })]),
      })

      const { body } = await call(uploader, batch.id)

      // Nothing retries a commit, so refusing to finish would keep an uploaded
      // CSV of contact details waiting for a button that no longer exists.
      expect(finishedOf(body)).toMatchObject({ summaryEmailed: false, reportEmailed: false })
      expect(await storedStatus(batch.id)).toBe('finished')
      expect((await eventAtLine(body, 2)).title).toBe('Class 2')
    })

    it('finishes a batch that could commit nothing at all', async () => {
      const batch = await createBatch({
        rows: [row(2, { errors: ['could not find this location'] })],
        // No node to create either, which is what leaves the whole commit with
        // nothing to invalidate — a tree is written whatever its rows do.
        proposedRegions: tree([]),
      })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({
        rows: { committed: 0, errors: 1 },
        regions: { created: 0, adopted: 0 },
        done: true,
      })
      // An import that changed nothing is the uploader's business alone: four
      // requests must not be enough to mail every admin.
      expect(messagesTo(admin.email!)).toEqual([])
      expect(finishedOf(body).reportEmailed).toBe(true)
      expect(lastMessage().to).toEqual([uploader.email])
      expect(lastMessage().subject).toBe('0 classes imported into Germany')
      expect(reasonsAtLine(body, 2)).toEqual(['could not find this location'])
    })

    /**
     * ⚠ **An install with no admin must not send the admin notice nowhere.** The
     * alternative to the system contact is a log line.
     */
    it('falls back to the system contact when no admin is reachable', async () => {
      await payload.update({
        collection: 'managers',
        id: admin.id,
        data: { type: 'manager' },
        overrideAccess: true,
      })
      try {
        const batch = await createBatch({
          rows: [row(2)],
          proposedRegions: tree([cityNode('fb', { lines: [2] })]),
        })

        await call(uploader, batch.id)

        expect(messagesTo(CONTACT_EMAIL)).toHaveLength(1)
      } finally {
        await payload.update({
          collection: 'managers',
          id: admin.id,
          data: { type: 'admin' },
          overrideAccess: true,
        })
      }
    })
  })

  describe('what it refuses', () => {
    it('moves a resolved batch to committing before it writes anything', async () => {
      // A batch the first call cannot finish, or the status would be
      // unobservable: the finish deletes the row it is written on.
      const lines = chunkCrossingLines()
      const batch = await createBatch({
        rows: lines.map((line) => row(line)),
        proposedRegions: tree([cityNode('st', { lines })]),
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

      const { status, body } = await call(admin, batch.id)

      expect(status).toBe(200)
      const log = asLog((await eventAtLine(body, 2)).activityLog)
      expect(log.find((entry) => entry.type === 'event-import')?.cells.who).toBe(
        `Commit Uploader (#${uploader.id})`,
      )
    })
  })
})
