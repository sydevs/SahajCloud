/**
 * The tree endpoint (#828): the edits it stores, and what it refuses.
 *
 * `applyTreeEdits` is pinned by its own unit spec, with `mappable` and
 * `takenSlugs` handed in. This covers only what that cannot:
 *
 * - **The candidate list is a database read.** A `map` edit arrives as a bare
 *   region id, and whether that region is inside the batch's target is the one
 *   question the pure core refuses to answer. Getting it wrong files a batch's
 *   classes outside the region it was aimed at.
 * - **The write has to survive a closed JSON schema.** `proposedRegions` is
 *   `z.strictObject` (`EventImports.ts`), so an edited tree carrying one key the
 *   proposal never wrote is refused by Ajv on save — invisible to a pure test.
 * - **The commit reads what this stored**, which is the acceptance criterion
 *   itself: a rename has to reach the region that gets created, and a mapping
 *   has to stop one being created at all.
 *
 * ⚠ **Every test tags its own places, and nothing is deleted afterwards.** One
 * database serves the file, `Regions.mapboxId` and `Regions.slug` are both
 * unique collection-wide, and `event_imports.targetRegion` is `NOT NULL` — so a
 * region a batch points at cannot be cleaned up, and an untagged "Berlin" would
 * collide with the last test's fixture.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { commitEventImport } from '@/collections/EventImports/endpoints/commit'
import { editEventImportTree } from '@/collections/EventImports/endpoints/tree'
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
type Row = EventImportRows[number]

const ANCHOR = '2026-10-06'

/** One row as the resolve step leaves it: an answer, and no reason it cannot have one. */
function row(line: number, city: string): Row {
  return {
    line,
    values: {
      title: `Class ${line}`,
      eventType: 'offline',
      country: 'DE',
      city,
      address: `Oranienstraße ${line}`,
      scheduleType: 'weekly',
      startTime: '18:30',
      weekdays: 'TU',
    },
    resolved: {
      latitude: 52.52,
      longitude: 13.405,
      timezone: 'Europe/Berlin',
      cityKey: city.toLowerCase(),
      placeName: city,
      placeId: `place.${city.toLowerCase()}`,
      mapboxId: `address.${city.toLowerCase()}.${line}`,
      subdivisionCode: 'BE',
      weekdayMask: 0b10,
      startMinutes: 1110,
      languages: ['de'],
      inactive: false,
      anchorDate: ANCHOR,
    },
  }
}

/** A `create` city node, tagged so two tests never propose the same feature. */
function cityNode(tag: string, options: { lines: number[]; parentKey?: string } = { lines: [2] }): Node {
  return {
    key: `city:id:mbx-${tag}-city`,
    level: 'city',
    name: `Berlin ${tag}`,
    parentKey: options.parentKey ?? null,
    match: { kind: 'create' },
    slug: `berlin-${tag}`,
    location: { kind: 'mapbox', mapboxId: `mbx-${tag}-city` },
    lines: options.lines,
  }
}

/** A `create` state node the cities below it hang from. */
function stateNode(tag: string, lines: number[]): Node {
  return {
    key: `state:${tag}`,
    level: 'region',
    name: `Brandenburg ${tag}`,
    parentKey: null,
    match: { kind: 'create' },
    slug: `brandenburg-${tag}`,
    location: { kind: 'manual', latitude: 52.4, longitude: 13.0, radius: 50_000 },
    lines,
  }
}

function tree(nodes: Node[], rowErrors: { line: number; message: string }[] = []): EventImportProposedRegions {
  return { nodes, rowErrors, stateLayer: { proposed: false, reason: 'one subdivision' } }
}

describe('tree endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let admin: Manager
  let uploader: Manager
  let outsider: Manager
  let inactiveManager: Manager
  let client: Client
  let germany: Region
  let austria: Region
  /** A city inside the target, which is what a `map` edit may name. */
  let leipzig: Region
  /** A city in another country, which it may not. */
  let vienna: Region

  const reqAs = (user: Client | Manager, id: number, body: unknown): PayloadRequest =>
    ({
      payload,
      headers: new Headers(),
      routeParams: { id: String(id) },
      user,
      locale: 'en',
      context: {},
      json: async () => body,
    }) as unknown as PayloadRequest

  async function call(
    user: Client | Manager,
    id: number,
    body: unknown,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = (await editEventImportTree.handler(reqAs(user, id, body))) as Response
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

  const storedTree = async (id: number): Promise<EventImportProposedRegions | undefined> =>
    (
      await payload.findByID({ collection: 'event-imports', id, depth: 0, overrideAccess: true })
    ).proposedRegions

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    admin = env.adminUser

    uploader = await testData.createManager(payload, {
      name: 'Tree Uploader',
      email: 'tree-uploader@example.com',
      roles: ['atlas-manager'],
    })
    outsider = await testData.createManager(payload, {
      name: 'Tree Outsider',
      email: 'tree-outsider@example.com',
      roles: ['atlas-manager'],
    })
    inactiveManager = await testData.createManager(payload, {
      name: 'Tree Retired',
      email: 'tree-retired@example.com',
      type: 'inactive' as const,
      roles: ['atlas-manager'],
    })
    client = await testData.createClient(payload, admin.id, {
      name: 'Tree Atlas Widget',
      roles: ['sahaj-atlas-client'],
    })

    // ⚠ The name is the fixture: the country code is read off the chain, so a
    // region called "Test Country" matches no ISO country and `loadTarget`
    // refuses every batch under it before an edit is applied.
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
    leipzig = await testData.createRegion(payload, {
      name: 'Leipzig',
      level: 'city',
      parent: germany.id,
    })
    vienna = await testData.createRegion(payload, {
      name: 'Vienna',
      level: 'city',
      parent: austria.id,
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('what it stores', () => {
    it('stores the renamed node and answers with the tree it stored', async () => {
      const node = cityNode('rename')
      const batch = await createBatch({ rows: [row(2, 'Berlin')], proposedRegions: tree([node]) })

      const { status, body } = await call(uploader, batch.id, {
        edits: [{ kind: 'rename', key: node.key, name: 'Berlin Mitte' }],
      })

      expect(status).toBe(200)
      const returned = body.proposedRegions as EventImportProposedRegions
      expect(returned.nodes[0].name).toBe('Berlin Mitte')
      expect(returned.nodes[0].slug).toBe('berlin-mitte')
      expect(await storedTree(batch.id)).toEqual(returned)
    })

    it('counts what the edited tree would create', async () => {
      const node = cityNode('tally')
      const batch = await createBatch({ rows: [row(2, 'Berlin')], proposedRegions: tree([node]) })

      const { body } = await call(uploader, batch.id, {
        edits: [{ kind: 'map', key: node.key, regionId: leipzig.id }],
      })

      expect(body).toMatchObject({ creating: 0, existing: 1, rowErrors: 0 })
    })

    // The namespace is collection-wide, so a rename onto a name the Atlas
    // already holds has to disambiguate rather than fail the commit's unique
    // constraint on a column no volunteer can read.
    it('disambiguates a rename against a slug the Atlas already holds', async () => {
      const node = cityNode('taken')
      const batch = await createBatch({ rows: [row(2, 'Berlin')], proposedRegions: tree([node]) })

      const { body } = await call(uploader, batch.id, {
        edits: [{ kind: 'rename', key: node.key, name: 'Leipzig' }],
      })

      expect((body.proposedRegions as EventImportProposedRegions).nodes[0].slug).toBe(
        'leipzig-germany',
      )
    })

    it('drops a state layer whose last new city was mapped away', async () => {
      const state = stateNode('orphan', [2])
      const city = cityNode('orphan', { lines: [2], parentKey: state.key })
      const batch = await createBatch({
        rows: [row(2, 'Berlin')],
        proposedRegions: tree([state, city]),
      })

      const { body } = await call(uploader, batch.id, {
        edits: [{ kind: 'map', key: city.key, regionId: leipzig.id }],
      })

      expect(body.pruned).toEqual([state.key])
      expect((body.proposedRegions as EventImportProposedRegions).nodes).toHaveLength(1)
    })
  })

  describe('the candidate list it reads', () => {
    it('refuses a region outside the target subtree', async () => {
      const node = cityNode('outside')
      const batch = await createBatch({ rows: [row(2, 'Berlin')], proposedRegions: tree([node]) })

      const { status, body } = await call(uploader, batch.id, {
        edits: [{ kind: 'map', key: node.key, regionId: vienna.id }],
      })

      expect(status).toBe(422)
      expect(JSON.stringify(body)).toContain('inside the one you are importing into')
      expect((await storedTree(batch.id))?.nodes[0].match).toEqual({ kind: 'create' })
    })

    it('refuses a region at the wrong level', async () => {
      const node = cityNode('level')
      const batch = await createBatch({ rows: [row(2, 'Berlin')], proposedRegions: tree([node]) })

      const { status, body } = await call(uploader, batch.id, {
        edits: [{ kind: 'map', key: node.key, regionId: germany.id }],
      })

      expect(status).toBe(422)
      expect(JSON.stringify(body)).toContain('cannot be mapped to a country')
    })
  })

  describe('what the commit then does', () => {
    const commit = async (id: number) => {
      const response = (await commitEventImport.handler({
        payload,
        headers: new Headers(),
        routeParams: { id: String(id) },
        user: uploader,
        locale: 'en',
        context: {},
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input')
        },
      } as unknown as PayloadRequest)) as Response
      return { status: response.status, body: (await response.json()) as Record<string, unknown> }
    }

    it('creates the region under the name the review gave it', async () => {
      const node = cityNode('committed')
      const batch = await createBatch({ rows: [row(2, 'Berlin')], proposedRegions: tree([node]) })

      await call(uploader, batch.id, {
        edits: [{ kind: 'rename', key: node.key, name: 'Berlin Kreuzberg' }],
      })
      const { status, body } = await commit(batch.id)

      expect(status).toBe(200)
      expect(body).toMatchObject({ done: true, regions: { created: 1 } })
      const { docs } = await payload.find({
        collection: 'regions',
        where: { mapboxId: { equals: 'mbx-committed-city' } },
        overrideAccess: true,
      })
      expect(docs[0]).toMatchObject({ name: 'Berlin Kreuzberg', slug: 'berlin-kreuzberg' })
    })

    it('creates no region for a mapped node and files its class in the mapped one', async () => {
      const node = cityNode('mapped')
      const batch = await createBatch({ rows: [row(2, 'Berlin')], proposedRegions: tree([node]) })

      await call(uploader, batch.id, {
        edits: [{ kind: 'map', key: node.key, regionId: leipzig.id }],
      })
      const { body } = await commit(batch.id)

      expect(body).toMatchObject({ done: true, regions: { created: 0, adopted: 0 } })
      const { totalDocs } = await payload.count({
        collection: 'regions',
        where: { mapboxId: { equals: 'mbx-mapped-city' } },
        overrideAccess: true,
      })
      expect(totalDocs).toBe(0)

      const committed = (body.finished as { committed: { eventId: number }[] }).committed
      const event = await payload.findByID({
        collection: 'events',
        id: committed[0].eventId,
        depth: 0,
        overrideAccess: true,
      })
      expect(event.region).toBe(leipzig.id)
    })
  })

  describe('what it refuses before reading anything', () => {
    it('refuses a batch being committed', async () => {
      const node = cityNode('locked')
      const batch = await createBatch({
        rows: [row(2, 'Berlin')],
        proposedRegions: tree([node]),
        status: 'committing',
      })

      const { status } = await call(uploader, batch.id, {
        edits: [{ kind: 'rename', key: node.key, name: 'Too Late' }],
      })

      expect(status).toBe(409)
    })

    it('refuses a batch with no tree to edit', async () => {
      const batch = await createBatch({ rows: [row(2, 'Berlin')], status: 'uploaded' })

      const { status, body } = await call(uploader, batch.id, {
        edits: [{ kind: 'rename', key: 'city:anything', name: 'Nothing' }],
      })

      expect(status).toBe(409)
      expect(JSON.stringify(body)).toContain('Propose the batch regions')
    })

    it('refuses a manager who does not manage the target', async () => {
      const node = cityNode('notyours')
      const batch = await createBatch({
        rows: [row(2, 'Berlin')],
        proposedRegions: tree([node]),
        uploader: outsider.id,
      })

      const { status } = await call(outsider, batch.id, {
        edits: [{ kind: 'rename', key: node.key, name: 'Not Theirs' }],
      })

      expect(status).toBe(403)
    })

    it('refuses an inactive manager and an API client', async () => {
      const node = cityNode('refused')
      const batch = await createBatch({ rows: [row(2, 'Berlin')], proposedRegions: tree([node]) })
      const edits = [{ kind: 'rename', key: node.key, name: 'Refused' }]

      expect((await call(inactiveManager, batch.id, { edits })).status).toBe(403)
      expect((await call(client, batch.id, { edits })).status).toBe(403)
    })

    it('refuses a body that names no edit', async () => {
      const node = cityNode('empty')
      const batch = await createBatch({ rows: [row(2, 'Berlin')], proposedRegions: tree([node]) })

      expect((await call(uploader, batch.id, { edits: [] })).status).toBe(400)
      expect((await call(uploader, batch.id, {})).status).toBe(400)
    })

    it('refuses a batch that does not exist', async () => {
      const { status } = await call(uploader, 99_999_999, {
        edits: [{ kind: 'rename', key: 'city:anything', name: 'Nothing' }],
      })

      expect(status).toBe(404)
    })
  })
})
