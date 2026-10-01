/**
 * The `event-imports` staging collection (#828): who reaches a batch, and when
 * a trashed one actually goes away.
 *
 * Both halves are asserted by reading and writing rows back through
 * `overrideAccess: false`, never by asking `hasPermission`. The collection
 * declares its own `access` block, which **replaces** the generated one — so a
 * grant check would answer about a role table these functions never consult,
 * and would have passed while the uploader scoping was missing entirely
 * (`docs/rules/access.md`, "Adding a collection to this list proves nothing on
 * its own").
 *
 * The window is crossed by injecting the job's `now`, not by backdating
 * `deletedAt` past it.
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { IMPORT_TRASH_RETENTION_DAYS } from '@/collections/EventImports/constants'
import { parseImportCsv } from '@/collections/EventImports/csv/parse'
import { buildImportTemplate } from '@/collections/EventImports/csv/template'
import { PurgeEventImports } from '@/jobs/PurgeEventImports/PurgeEventImports'
import type {
  Client,
  EventImport,
  EventImportRows,
  EventImportsSelect,
  Manager,
  Region,
} from '@/payload-types'
import { hasPermission } from '@/plugins/access'

import { runTaskHandler } from '../utils/taskRunner'
import { createData, testData, type FixtureOverrides } from '../utils/testData'
import { createTestEnvironment, idOnlySelect } from '../utils/testHelpers'

const DAY_MS = 24 * 60 * 60 * 1000

describe('Event imports', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let admin: Manager
  let uploader: Manager
  let otherManager: Manager
  let inactiveUploader: Manager
  let client: Client
  let region: Region

  const reqAs = (user: Manager | Client): PayloadRequest =>
    ({
      payload,
      headers: new Headers(),
      user,
      locale: 'en',
      context: {},
    }) as unknown as PayloadRequest

  const createBatch = (overrides: FixtureOverrides<EventImport> = {}) =>
    payload.create({
      collection: 'event-imports',
      data: createData<'event-imports'>({
        targetRegion: region.id,
        uploader: uploader.id,
        defaultLanguages: ['de'],
        ...overrides,
      }),
      overrideAccess: true,
    })

  const readAs = (user: Manager | Client) =>
    payload.find({
      collection: 'event-imports',
      depth: 0,
      pagination: false,
      select: idOnlySelect<EventImportsSelect>(),
      overrideAccess: false,
      req: reqAs(user),
    })

  const updateAs = (user: Manager, id: number, data: FixtureOverrides<EventImport>) =>
    payload.update({
      collection: 'event-imports',
      id,
      data,
      depth: 0,
      overrideAccess: false,
      req: reqAs(user),
    })

  /** Move a batch to the trash the way a discard does — an update, not a delete. */
  const trash = (id: number, deletedAt: Date) =>
    payload.update({
      collection: 'event-imports',
      id,
      data: { deletedAt: deletedAt.toISOString() },
      overrideAccess: true,
    })

  /** Run the sweep one full retention window after `anchor`. */
  const sweep = (anchor: number, dryRun = false) =>
    runTaskHandler(PurgeEventImports, {
      payload,
      input: {
        now: new Date(anchor + IMPORT_TRASH_RETENTION_DAYS * DAY_MS).toISOString(),
        dryRun,
      },
    })

  const exists = async (id: number) => {
    const doc = await payload.findByID({
      collection: 'event-imports',
      id,
      depth: 0,
      trash: true,
      overrideAccess: true,
      disableErrors: true,
    })
    return doc != null
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    admin = env.adminUser

    uploader = await testData.createManager(payload, {
      name: 'Import Uploader',
      email: 'import-uploader@example.com',
      roles: ['atlas-manager'],
    })
    otherManager = await testData.createManager(payload, {
      name: 'Other Atlas Manager',
      email: 'import-other@example.com',
      roles: ['atlas-manager'],
    })
    inactiveUploader = await testData.createManager(payload, {
      name: 'Retired Uploader',
      email: 'import-retired@example.com',
      type: 'inactive' as const,
      roles: ['atlas-manager'],
    })
    client = await testData.createClient(payload, admin.id, {
      name: 'Atlas Widget',
      roles: ['sahaj-atlas-client'],
    })
    region = await testData.createRegion(payload, { name: 'Import Target', level: 'country' })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('access', () => {
    let own: EventImport
    let theirs: EventImport

    beforeAll(async () => {
      own = await createBatch()
      theirs = await createBatch({ uploader: otherManager.id })
    })

    it('shows a manager their own batches and nobody else’s', async () => {
      const { docs } = await readAs(uploader)
      expect(docs.map((doc) => doc.id)).toEqual([own.id])
    })

    it('shows an admin every batch', async () => {
      const { docs } = await readAs(admin)
      expect(docs.map((doc) => doc.id)).toEqual(expect.arrayContaining([own.id, theirs.id]))
    })

    it('refuses an inactive manager, who would otherwise match on `uploader`', async () => {
      const hers = await createBatch({ uploader: inactiveUploader.id })
      // A refusal, not an empty page: the access function returns `false`, so
      // Payload throws rather than running a `Where` that would have matched.
      await expect(readAs(inactiveUploader)).rejects.toThrow(/not allowed/i)
      expect(await exists(hers.id)).toBe(true)
    })

    it('refuses a published API client, which "no project" would otherwise share', async () => {
      await expect(readAs(client)).rejects.toThrow(/not allowed/i)
      // Two separate layers, and only the first is what the read above proves.
      // The collection's own `access` block refuses every non-manager outright;
      // `RESTRICTED_COLLECTIONS` is what stops implicit *shared* read reaching a
      // collection in no project, and it is the layer that survives if that
      // block is ever narrowed. `hasPermission` is where it can be seen.
      expect(
        hasPermission({
          user: { ...client, collection: 'clients' } as never,
          collection: 'event-imports',
          operation: 'read',
        }),
      ).toBe(false)
    })

    it('refuses another manager an update on a batch that is not theirs', async () => {
      await expect(updateAs(otherManager, own.id, { status: 'resolved' })).rejects.toThrow(
        /not allowed/i,
      )
    })

    it('refuses the uploader their own discard, because a trash attempt runs the `delete` check too', async () => {
      // ⚠ **This pins a gap, not a rule.** `access.ts` says the discard rides on
      // `update`, and it does not: `updateByID` detects `deletedAt` in the patch
      // and runs `access.delete` **as well** as `access.update`
      // (`payload/dist/collections/operations/updateByID.js:110-118`). `delete`
      // here is the generated config — admins only — so nobody but an admin can
      // discard a batch, and the seven-day retention window has no volunteer-
      // reachable way in. Closing it means overriding `delete` to allow the
      // uploader when `data.deletedAt` is set (Payload passes `data` to the
      // access function for exactly that), which belongs with the review UI that
      // offers the button. Until then this case is the record that it does not
      // work; delete it in the same change that makes it work.
      const mine = await createBatch()

      await expect(
        updateAs(uploader, mine.id, { deletedAt: new Date().toISOString() }),
      ).rejects.toThrow(/not allowed/i)
    })

    it('strips an uploader’s write to `status` and `rows`, which the endpoints own', async () => {
      // ⚠ Both are what the next step trusts, and `rows` is `readOnly` only in
      // the admin — a UI affordance, not access control. Writable here, an
      // uploader could hand-write a `resolved` block at any coordinates and flip
      // `status`, and the resolve endpoint would treat the row as finished:
      // its country and subdivision checks never re-run on an answered row.
      const mine = await createBatch()

      const updated = await updateAs(uploader, mine.id, {
        status: 'resolved',
        rows: [{ line: 2, values: { title: 'Injected' } }],
      })

      expect(updated.status).toBe('uploaded')
      expect(updated.rows).toBeFalsy()
    })

    it('strips an uploader’s attempt to re-point the batch out of their subtree', async () => {
      const mine = await createBatch()
      const elsewhere = await testData.createRegion(payload, {
        name: 'Somebody Else’s Country',
        level: 'country',
      })

      // ⚠ A denied field update is **stripped, not refused**, so the write
      // succeeds and the value has to be read back. Both fields are what the
      // subtree check and the access rule are computed from, so a successful
      // re-point would move the batch, not just edit it.
      const updated = await updateAs(uploader, mine.id, {
        targetRegion: elsewhere.id,
        uploader: otherManager.id,
      })

      expect(updated.targetRegion).toBe(region.id)
      expect(updated.uploader).toBe(uploader.id)
    })

    it('refuses create to an atlas-manager — the endpoints are the only writer', async () => {
      await expect(
        payload.create({
          collection: 'event-imports',
          data: createData<'event-imports'>({
            targetRegion: region.id,
            uploader: uploader.id,
            defaultLanguages: ['de'],
          }),
          overrideAccess: false,
          req: reqAs(uploader),
        }),
      ).rejects.toThrow(/not allowed/i)
    })
  })

  describe('the batch default languages', () => {
    it('takes the admin locale’s base subtag, not the locale code', async () => {
      // ⚠ `pt-BR` is an admin locale and not an ISO 639-1 language, so the
      // locale code itself is a value `Events.languages` would refuse — which is
      // where these end up for every row that names none of its own.
      const batch = (await payload.create({
        collection: 'event-imports',
        locale: 'pt-BR',
        data: { targetRegion: region.id, uploader: uploader.id } as never,
        overrideAccess: true,
      })) as EventImport

      expect(batch.defaultLanguages).toEqual(['pt'])
    })
  })

  describe('the rows column', () => {
    it('stores the parser’s output as it stands, with no reshaping', async () => {
      const parsed = parseImportCsv(buildImportTemplate())
      if (!parsed.ok) throw new Error(`The generated template did not parse: ${parsed.error}`)

      // The assignment is the assertion: `ParsedRow[]` has to satisfy the
      // column's generated type, or the resolve step would owe a translation
      // layer between the parser and what it persists.
      const rows: EventImportRows = parsed.rows

      const batch = await createBatch({ rows })
      const stored = (await payload.findByID({
        collection: 'event-imports',
        id: batch.id,
        depth: 0,
        overrideAccess: true,
      })) as EventImport

      expect(stored.rows).toEqual(rows)
      // The template is a header, one `#` help row, and one example row — so the
      // only data row is line 3, and the help row did not become a row of its own.
      expect(stored.rows).toHaveLength(1)
      expect(stored.rows?.[0]?.line).toBe(3)
    })

    it('refuses a row the schema does not describe', async () => {
      await expect(
        createBatch({ rows: [{ line: 2, values: {}, surprise: true }] as never }),
      ).rejects.toThrow()
    })
  })

  describe('the nightly purge', () => {
    it('hard-deletes a batch trashed for the retention window, and keeps a younger one', async () => {
      const due = await createBatch()
      const young = await createBatch()
      const live = await createBatch()
      const anchor = Date.now()
      await trash(due.id, new Date(anchor))
      await trash(young.id, new Date(anchor + DAY_MS))

      const { deletedBatches } = await sweep(anchor)

      expect(deletedBatches).toBe(1)
      expect(await exists(due.id)).toBe(false)
      expect(await exists(young.id)).toBe(true)
      expect(await exists(live.id)).toBe(true)
    })

    it('counts without deleting on a dry run', async () => {
      const due = await createBatch()
      const anchor = Date.now()
      await trash(due.id, new Date(anchor))

      const { deletedBatches } = await sweep(anchor, true)

      expect(deletedBatches).toBe(1)
      expect(await exists(due.id)).toBe(true)
    })

    it('refuses the uploader a hard delete, so the window is theirs to wait out', async () => {
      // Discard is an `update` to `deletedAt`, which the uploader may do. Emptying
      // their own trash early is what the retention promise cannot survive, so
      // `delete` is left to the generated config — admins and the sweep only.
      const mine = await createBatch()
      await trash(mine.id, new Date())

      await expect(
        payload.delete({
          collection: 'event-imports',
          id: mine.id,
          trash: true,
          overrideAccess: false,
          req: reqAs(uploader),
        }),
      ).rejects.toThrow(/not allowed/i)
      expect(await exists(mine.id)).toBe(true)
    })
  })
})
