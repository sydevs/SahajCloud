/**
 * The review endpoint (#828): the two answers the review surface cannot assemble
 * for itself, and the one it must not be given.
 *
 * `reviewRows` is pinned by its own unit spec, with the known addresses handed
 * in. This covers only what that cannot:
 *
 * - **The mappable list is a database read**, scoped to the target's subtree.
 *   Offering a region the edit endpoint then refuses would read as the mapping
 *   control being broken, so the two have to read one subtree.
 * - **Whether an address already holds an account is a `managers` read on
 *   `email`**, a column locked to admins and the holder
 *   (`src/collections/Managers/access.ts`). The endpoint elevates past that lock,
 *   which is invisible to a pure test and is the whole reason this read lives on
 *   the server.
 * - **It answers a count, never the accounts.** The banner says how many
 *   coordinators are new and discloses nothing about the existing ones, so the
 *   response body itself is asserted rather than the count alone.
 *
 * ⚠ **Every test tags its own places, and nothing is deleted afterwards.** One
 * database serves the file, `Regions.mapboxId` and `Regions.slug` are both
 * unique collection-wide, and `event_imports.targetRegion` is `NOT NULL` — the
 * same constraint `event-import-tree.int.spec.ts` documents.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { reviewEventImport } from '@/collections/EventImports/endpoints/review'
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
function row(line: number, values: Record<string, string> = {}): Row {
  return {
    line,
    values: {
      title: `Class ${line}`,
      eventType: 'offline',
      country: 'DE',
      city: 'Berlin',
      address: `Oranienstraße ${line}`,
      scheduleType: 'weekly',
      startTime: '18:30',
      weekdays: 'TU',
      ...values,
    },
    resolved: {
      latitude: 52.52,
      longitude: 13.405,
      timezone: 'Europe/Berlin',
      cityKey: 'berlin',
      placeName: 'Berlin',
      placeId: 'place.berlin',
      mapboxId: null,
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
function cityNode(tag: string, lines = [2]): Node {
  return {
    key: `city:id:mbx-review-${tag}`,
    level: 'city',
    name: `Berlin ${tag}`,
    parentKey: null,
    match: { kind: 'create' },
    slug: `berlin-review-${tag}`,
    location: { kind: 'mapbox', mapboxId: `mbx-review-${tag}` },
    lines,
  }
}

const tree = (
  nodes: Node[],
  rowErrors: { line: number; message: string }[] = [],
): EventImportProposedRegions => ({
  nodes,
  rowErrors,
  stateLayer: { proposed: false, reason: 'one subdivision' },
})

describe('review endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let admin: Manager
  let uploader: Manager
  let outsider: Manager
  let inactiveManager: Manager
  /** Manages the target too, but uploaded nothing — the batch is not theirs. */
  let coManager: Manager
  let client: Client
  let germany: Region
  /** A city inside the target, which a mapping may name. */
  let leipzig: Region
  /** A city in another country, which it may not. */
  let vienna: Region
  /** An account a CSV row may already name, with a name the review must not leak. */
  let heldAccount: Manager

  const reqAs = (user: Client | Manager, id: number | string): PayloadRequest =>
    ({
      payload,
      headers: new Headers(),
      routeParams: { id: String(id) },
      user,
      locale: 'en',
      context: {},
    }) as unknown as PayloadRequest

  async function call(
    user: Client | Manager,
    id: number | string,
  ): Promise<{ status: number; body: Record<string, unknown>; raw: string }> {
    const response = (await reviewEventImport.handler(reqAs(user, id))) as Response
    const raw = await response.text()
    return { status: response.status, body: JSON.parse(raw) as Record<string, unknown>, raw }
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

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    admin = env.adminUser

    uploader = await testData.createManager(payload, {
      name: 'Review Uploader',
      email: 'review-uploader@example.com',
      roles: ['atlas-manager'],
    })
    outsider = await testData.createManager(payload, {
      name: 'Review Outsider',
      email: 'review-outsider@example.com',
      roles: ['atlas-manager'],
    })
    inactiveManager = await testData.createManager(payload, {
      name: 'Review Retired',
      email: 'review-retired@example.com',
      type: 'inactive' as const,
      roles: ['atlas-manager'],
    })
    coManager = await testData.createManager(payload, {
      name: 'Review Co-manager',
      email: 'review-comanager@example.com',
      roles: ['atlas-manager'],
    })
    client = await testData.createClient(payload, admin.id, {
      name: 'Review Atlas Widget',
      roles: ['sahaj-atlas-client'],
    })
    // ⚠ The name is distinctive on purpose: the privacy assertion below looks
    // for it in the serialised body, and a name shared with another fixture
    // would make that search pass for the wrong reason.
    heldAccount = await testData.createManager(payload, {
      name: 'Shanti Kulkarni-Vandermeer',
      email: 'review-held@example.com',
      roles: ['atlas-manager'],
    })

    // ⚠ The name is the fixture: the country code is read off the chain, so a
    // region called "Test Country" matches no ISO country and `loadTarget`
    // refuses every batch under it.
    germany = await testData.createRegion(payload, {
      name: 'Germany',
      level: 'country',
      managers: [uploader.id, coManager.id],
    })
    // ⚠ The outsider has to manage *something*, or `ownedRegionFilterOptions`
    // answers `false` and the 403 comes from "you manage no region" — which
    // passes a subtree test without the subtree check ever running.
    const austria = await testData.createRegion(payload, {
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

  describe('what it answers', () => {
    it('answers the stored tree verbatim, its tally, and the target', async () => {
      // A name no proposal would produce: if the endpoint rebuilt the tree
      // instead of reading it, this is the edit that would disappear.
      const edited = { ...cityNode('stored'), name: 'Renamed By A Reviewer' }
      const batch = await createBatch({ rows: [row(2)], proposedRegions: tree([edited]) })

      const { status, body } = await call(uploader, batch.id)

      expect(status).toBe(200)
      expect(body.proposedRegions).toEqual(tree([edited]))
      expect(body).toMatchObject({
        creating: 1,
        existing: 0,
        rowErrors: 0,
        status: 'resolved',
        target: { id: germany.id, level: 'country', name: 'Germany' },
      })
    })

    it('offers the regions inside the target, and no region outside it', async () => {
      const batch = await createBatch({
        rows: [row(2)],
        proposedRegions: tree([cityNode('mappable')]),
      })

      const { body } = await call(uploader, batch.id)

      const ids = (body.mappable as { id: number }[]).map((region) => region.id)
      expect(ids).toContain(leipzig.id)
      expect(ids).toContain(germany.id)
      expect(ids).not.toContain(vienna.id)
      expect(body.mappable).toContainEqual({ id: leipzig.id, level: 'city', name: 'Leipzig' })
    })

    // The lock on `managers.email` is why this read lives on the server at all:
    // the review has to know the address is taken without being told whose.
    it('says how many coordinators are new, reading a column the caller cannot', async () => {
      const batch = await createBatch({
        rows: [
          row(2, { managerEmail: 'review-held@example.com' }),
          row(3, { managerEmail: 'review-fresh@example.com' }),
          row(4, { managerEmail: 'Review-Fresh@example.com' }),
        ],
        proposedRegions: tree([cityNode('coordinators', [2, 3, 4])]),
      })

      const { body } = await call(uploader, batch.id)

      expect(body.coordinators).toEqual({ existing: 1, created: 1 })
      expect((body.rows as { coordinator: string }[]).map((reviewed) => reviewed.coordinator)).toEqual(
        ['existing', 'new', 'new'],
      )
    })

    // ⚠ The assertion is on the serialised body, not on the count: a shape that
    // carried the matched account alongside the tally would satisfy every
    // count-based assertion above it.
    it('discloses nothing about the account it matched', async () => {
      const batch = await createBatch({
        rows: [row(2, { managerEmail: 'review-held@example.com' })],
        proposedRegions: tree([cityNode('private')]),
      })

      const { raw } = await call(uploader, batch.id)

      expect(raw).not.toContain(heldAccount.name)
      // Not even the address, which the uploader typed themselves: the row
      // carries a verdict and no values, so there is nothing here to pair an
      // address with "the Atlas already knows this person".
      expect(raw).not.toContain('review-held@example.com')
      expect(raw).not.toContain('atlas-manager')
    })

    it('carries the proposal’s own row errors through to the table', async () => {
      const batch = await createBatch({
        rows: [row(2, { city: '' }), { ...row(3), errors: ['could not find this location'] }],
        proposedRegions: tree([cityNode('errors')], [{ line: 2, message: 'managed elsewhere' }]),
      })

      const { body } = await call(uploader, batch.id)

      expect(body).toMatchObject({ rowErrors: 1 })
      const rows = body.rows as { line: number; status: string; reasons: string[] }[]
      // ⚠ The tree's own refusal is NOT on the row yet — `adoptTreeErrors` copies
      // it over at commit, so the review reads it from `rowErrors` and line 2
      // still looks ready here. Pinned so the asymmetry is a decision rather
      // than a surprise for whoever renders the table.
      expect(rows.find((reviewed) => reviewed.line === 2)?.status).toBe('ready')
      expect(rows.find((reviewed) => reviewed.line === 3)?.status).toBe('error')
    })
  })

  describe('what it refuses', () => {
    it('refuses a batch with no tree yet', async () => {
      const batch = await createBatch({ rows: [row(2)], status: 'uploaded' })

      const { status, body } = await call(uploader, batch.id)

      expect(status).toBe(409)
      expect(JSON.stringify(body)).toContain('Propose the batch regions')
    })

    it('refuses a manager who does not manage the target', async () => {
      const batch = await createBatch({
        rows: [row(2)],
        proposedRegions: tree([cityNode('notyours')]),
        uploader: outsider.id,
      })

      expect((await call(outsider, batch.id)).status).toBe(403)
    })

    // ⚠ **Not the same case as the one above.** That manager fails the subtree
    // check; this one passes it and must still be refused, because the rows hold
    // the uploaded CSV verbatim — contact names, phone numbers and emails
    // (`access.ts`). Asserted through the endpoint rather than by trusting the
    // collection's `access` block.
    it('refuses a co-manager of the target who did not upload the batch', async () => {
      const batch = await createBatch({
        rows: [row(2)],
        proposedRegions: tree([cityNode('comanager')]),
      })

      expect((await call(coManager, batch.id)).status).toBe(404)
    })

    it('refuses an inactive manager and an API client', async () => {
      const batch = await createBatch({
        rows: [row(2)],
        proposedRegions: tree([cityNode('refused')]),
      })

      expect((await call(inactiveManager, batch.id)).status).toBe(403)
      expect((await call(client, batch.id)).status).toBe(403)
    })

    it('refuses an id Postgres could not hold', async () => {
      expect((await call(uploader, '1e30')).status).toBe(400)
    })
  })
})
