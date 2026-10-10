/**
 * The `event-imports` collection, as far as phase 1 of #907 builds it: the
 * upload that becomes a batch, and who may start one.
 *
 * ⚠ **The access assertions read rows back through `overrideAccess: false`, not
 * `hasPermission`.** Adding a collection to `RESTRICTED_COLLECTIONS` proves
 * nothing on its own (`docs/rules/access.md`), and a `hasPermission` assertion
 * would have passed while the hole was open. The same is true of the
 * `manager`-field grant: it is the field NAME that `getDocManagerFields`
 * recognises, so the only honest test is a read by somebody who is not the
 * uploader.
 *
 * The jobs, the status transitions and the commit live in
 * `event-import-jobs.int.spec.ts`, which mocks the geocoder — the one thing this
 * file must not, since its subject is the upload.
 */

import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'


import { buildImportTemplate } from '@/collections/EventImports/csv/template'
import { EventImports } from '@/collections/EventImports/EventImports'
import { ALLOWED } from '@/collections/EventImports/hooks/transitionStatus'
import type { WorkflowActionsProps } from '@/components/admin/buttons/WorkflowActions/stages'
import { CREATE_STAGE } from '@/components/admin/buttons/WorkflowActions/stages'
import { getDocManagerFields } from '@/plugins/access/documentManagers'

import { createAnonRestClient, createRestClientAs } from '../utils/restRequest'
import { createData, testData } from '../utils/testData'
import { createTestEnvironment, idOnlySelect } from '../utils/testHelpers'

/** A CSV with one usable class per line, keyed off the real template's header. */
function csvWith(lines: readonly string[]): Buffer {
  const header = buildImportTemplate().split('\n')[0]!
  return Buffer.from(`${header}\n${lines.join('\n')}\n`, 'utf8')
}

/**
 * One offline weekly class, in the template's own column order.
 *
 * ⚠ **Composed from `IMPORT_COLUMNS` through the header above, never typed out
 * as a 29-field literal.** A column added or reordered upstream would otherwise
 * shift every value one place and the row would still parse.
 */
function classLine(title: string, city = 'Berlin'): string {
  const cells: Record<string, string> = {
    title,
    eventType: 'offline',
    country: 'DE',
    city,
    address: 'Oranienstraße 25',
    scheduleType: 'weekly',
    date: '2026-01-06',
    startTime: '18:30',
    weekdays: 'TU',
  }
  return buildImportTemplate()
    .split('\n')[0]!
    .replace(/^﻿/, '')
    .split(',')
    .map((column) => cells[column] ?? '')
    .join(',')
}

const file = (data: Buffer, name = 'classes.csv') => ({
  data,
  mimetype: 'text/csv',
  name,
  size: data.length,
})

describe('event-imports', () => {
  let payload: Payload
  let config: Awaited<ReturnType<typeof createTestEnvironment>>['config']
  let cleanup: () => Promise<void>
  let country: number
  /**
   * ⚠ **The factory's whole return value, not `{ id, collection }`.** Access
   * reads `type` and `roles` straight off `user`, so a hand-built pair is an
   * anonymous caller with an id and every operation answers `Forbidden`.
   */
  let admin: Awaited<ReturnType<typeof testData.createManager>>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    config = env.config
    cleanup = env.cleanup

    admin = await testData.createManager(payload, { name: 'Import Admin', type: 'admin' })
    const germany = await testData.createRegion(payload, { name: 'Germany', level: 'country' })
    country = germany.id
  })

  afterAll(async () => {
    await cleanup()
  })

  const createBatch = (
    data: Record<string, unknown>,
    upload: Buffer,
    user: Awaited<ReturnType<typeof testData.createManager>> = admin,
  ) =>
    payload.create({
      collection: 'event-imports',
      data: createData<'event-imports'>({ targetRegion: country, defaultLanguages: ['de'], ...data }),
      file: file(upload),
      user,
      overrideAccess: false,
    })

  /**
   * The per-field message off a rejected write. Payload keeps a generic summary
   * on `.message` ("The following field is invalid: …") and the message a human
   * actually reads on `.data.errors[]` — which is what the admin form renders
   * under the field. Asserting the summary would pass for any refusal at all.
   */
  const fieldErrorMessage = async (write: Promise<unknown>, path: string): Promise<string> => {
    try {
      await write
      throw new Error(`expected the write to be rejected on "${path}"`)
    } catch (error) {
      const data = (error as { data?: { errors?: { path: string; message: string }[] } }).data
      const match = (data?.errors ?? []).find((entry) => entry.path === path)
      if (!match) throw error
      return match.message
    }
  }

  describe('the upload becomes the batch', () => {
    it('parses the file into rows and starts resolving', async () => {
      const batch = await createBatch({}, csvWith([classLine('Tuesday Evening Meditation')]))

      expect(batch.status).toBe('resolving')
      expect(batch.rows).toHaveLength(1)
      expect(batch.rows?.[0]).toMatchObject({ values: { title: 'Tuesday Evening Meditation' } })
      // The file itself is the document, so Payload stored it.
      expect(batch.filename).toMatch(/^classes(-\d+)?\.csv$/)
    })

    it('stamps the creating manager, whatever the caller sent', async () => {
      const other = await testData.createManager(payload, { name: 'Somebody Else' })
      const batch = await createBatch({ manager: other.id }, csvWith([classLine('Stamped')]))

      const managerId = typeof batch.manager === 'object' ? batch.manager.id : batch.manager
      expect(managerId).toBe(admin.id)
    })

    it('refuses a file whose every row is broken, naming the lines', async () => {
      // `eventType` is required of every row, so a file of blanks under a valid
      // header parses structurally and fails row by row.
      const broken = csvWith([classLine('No type').replace('offline', ''), ',,,,,'])

      expect(await fieldErrorMessage(createBatch({}, broken), 'file')).toMatch(
        /Every row in the file has a problem.*line 2/,
      )
    })

    it('refuses a file the parser cannot read at all', async () => {
      await expect(
        createBatch({}, Buffer.from('not,a,known,header\n1,2,3,4\n', 'utf8')),
      ).rejects.toThrow()
    })
  })

  describe('the target region', () => {
    it('refuses a level no batch can hold', async () => {
      // A venue hangs off a city, never a country — `Regions` refuses the
      // shorter chain itself, so the fixture has to build both.
      const city = await testData.createRegion(payload, { level: 'city', parent: country })
      const venue = await testData.createRegion(payload, { level: 'venue', parent: city.id })

      expect(
        await fieldErrorMessage(
          createBatch({ targetRegion: venue.id }, csvWith([classLine('At a venue')])),
          'targetRegion',
        ),
      ).toMatch(/cannot hold imported classes/)
    })

    it('refuses a region outside an atlas-manager’s subtree', async () => {
      const outsider = await testData.createManager(payload, {
        name: 'Other Country Manager',
        roles: ['atlas-manager'],
      })

      expect(
        await fieldErrorMessage(
          createBatch({}, csvWith([classLine('Not mine')]), outsider),
          'targetRegion',
        ),
      ).toMatch(/do not manage that region/)
    })

    it('accepts one the atlas-manager does manage', async () => {
      const owner = await testData.createManager(payload, {
        name: 'Germany Manager',
        roles: ['atlas-manager'],
      })
      await payload.update({
        collection: 'regions',
        id: country,
        data: { managers: [owner.id] },
      })

      const batch = await createBatch({}, csvWith([classLine('Mine')]), owner)
      expect(batch.status).toBe('resolving')
    })
  })

  describe('access', () => {
    it('names `manager` as the document-manager field', () => {
      // This is what grants the uploader read and update on their own batches,
      // and the only reason the collection needs no `access` block.
      expect(getDocManagerFields(payload, 'event-imports').managerField).toBe('manager')
    })

    /**
     * ⚠ **Read back through `overrideAccess: false`, never asserted from
     * `hasPermission`.** `docs/rules/access.md` records two leaks of exactly
     * this shape (#821, #822) and says a `hasPermission` assertion would have
     * passed while both holes were open. The widget's browser key is a
     * published `sahaj-atlas-client`, so this is the caller that matters.
     */
    it('refuses a published API client, which is what RESTRICTED_COLLECTIONS is for', async () => {
      const owner = await testData.createManager(payload, {
        name: 'Client Test Owner',
        roles: ['atlas-manager'],
      })
      await payload.update({ collection: 'regions', id: country, data: { managers: [owner.id] } })
      await createBatch({}, csvWith([classLine('Not for a key')]), owner)

      const clientDoc = await testData.createClient(payload, owner.id, {
        name: 'Atlas Widget Key',
        roles: ['sahaj-atlas-client'],
      })
      const asClient = {
        id: clientDoc.id,
        collection: 'clients',
        _status: 'published',
        roles: ['sahaj-atlas-client'],
      }

      await expect(
        payload.find({
          collection: 'event-imports',
          user: asClient as never,
          overrideAccess: false,
          depth: 0,
          // The client query gate refuses a read with no `select` before access
          // control runs, so without this the case would pass for the wrong
          // reason and say nothing about who may read the collection.
          select: idOnlySelect(),
        }),
      ).rejects.toThrow(/not allowed/)
    })

    it('lists the uploader’s own batch', async () => {
      const mine = await testData.createManager(payload, {
        name: 'Mine',
        roles: ['atlas-manager'],
      })
      await payload.update({ collection: 'regions', id: country, data: { managers: [mine.id] } })

      const ownBatch = await createBatch({}, csvWith([classLine('Own batch')]), mine)
      const listed = await payload.find({
        collection: 'event-imports',
        user: mine as never,
        overrideAccess: false,
        depth: 0,
      })

      expect(listed.docs.map((doc) => doc.id)).toContain(ownBatch.id)
    })

    /**
     * ⚠ **A manager who manages the region but holds no batch is refused
     * outright, not handed an empty list.** The grant is keyed on
     * `event-imports.manager`, so `resolveManagedDocIds` resolves nothing for
     * them and access answers `false` rather than a `Where`.
     *
     * That is the ticket's rule ("reads and updates only their own batches"),
     * and it is pinned here because phase 4 puts a `join` on `targetRegion` in
     * front of it: a second manager of the same region will see join rows this
     * refusal then denies. Whether discovery should move to the region subtree
     * is the reviewer's call, not this spec's.
     */
    it('refuses a region’s other manager, who holds no batch of their own', async () => {
      const [mine, theirs] = await Promise.all([
        testData.createManager(payload, { name: 'Holder', roles: ['atlas-manager'] }),
        testData.createManager(payload, { name: 'Co-manager', roles: ['atlas-manager'] }),
      ])
      await payload.update({
        collection: 'regions',
        id: country,
        data: { managers: [mine.id, theirs.id] },
      })
      await createBatch({}, csvWith([classLine('Not theirs')]), mine)

      await expect(
        payload.find({
          collection: 'event-imports',
          user: theirs as never,
          overrideAccess: false,
          depth: 0,
        }),
      ).rejects.toThrow(/not allowed/)
    })

    /**
     * ⚠ **`status` is deliberately NOT in this list.** The buttons submit it as
     * a field value, so field access cannot deny it without denying them too.
     * `hooks/transitionStatus.ts` is its gate instead, and the transitions it
     * refuses are covered in `event-import-jobs.int.spec.ts` beside the jobs
     * they release.
     */
    it('leaves the uploader unable to re-point `manager` or `targetRegion`', async () => {
      const owner = await testData.createManager(payload, {
        name: 'Field Lock Owner',
        roles: ['atlas-manager'],
      })
      await payload.update({ collection: 'regions', id: country, data: { managers: [owner.id] } })
      const batch = await createBatch({}, csvWith([classLine('Locked fields')]), owner)
      const other = await testData.createManager(payload, { name: 'Hijack Target' })
      const elsewhere = await testData.createRegion(payload, { level: 'country' })

      const updated = await payload.update({
        collection: 'event-imports',
        id: batch.id,
        data: { manager: other.id, targetRegion: elsewhere.id } as never,
        user: owner as never,
        overrideAccess: false,
        depth: 0,
      })

      // Field access drops the denied value rather than erroring, which is why
      // this reads the row back instead of expecting a rejection.
      expect(updated.manager).toBe(owner.id)
      expect(updated.targetRegion).toBe(country)
    })
  })

  /**
   * What Payload's own file route does with this collection's `read`.
   *
   * ⚠ **This does NOT cover `disablePayloadAccessControl`, and cannot.**
   * `storagePlugin` returns before `cloudStoragePlugin` whenever a Cloudflare
   * credential is missing — every local run and every CI run — so the flag is
   * never applied here and Payload serves the file either way. Emptying
   * `PAYLOAD_SERVED_COLLECTIONS` leaves this green; it is
   * `tests/unit/storage-payload-served.spec.ts` that goes red, which is why
   * that spec reads the module's own table.
   *
   * What this buys is the other half, and no pure test can state it:
   * `checkFileAccess` applies the `Where` the document-manager grant returns as
   * a constraint on the document behind the filename — so the batch's own
   * `manager` decides who may fetch the CSV, not merely who may read the row.
   *
   * Asserted over REST, because the gate lives in the route and the local API
   * never reaches it.
   */
  describe('the uploaded file', () => {
    it('is refused to an anonymous caller and to a manager who does not hold the batch', async () => {
      const [holder, outsider] = await Promise.all([
        testData.createManager(payload, { name: 'File Holder', roles: ['atlas-manager'] }),
        testData.createManager(payload, { name: 'File Outsider', roles: ['atlas-manager'] }),
      ])
      await payload.update({ collection: 'regions', id: country, data: { managers: [holder.id] } })
      const batch = await createBatch({}, csvWith([classLine('Private contacts')]), holder)
      const path = `/api/event-imports/file/${batch.filename}`

      const anon = createAnonRestClient({ payload, config })
      const asOutsider = await createRestClientAs({ payload, config }, outsider)
      const asHolder = await createRestClientAs({ payload, config }, holder)

      expect((await anon(path)).status).toBe(403)
      expect((await asOutsider(path)).status).toBe(403)
      expect((await asHolder(path)).status).toBe(200)
    })
  })

  /**
   * ⚠ **The buttons are the only way a caller reaches a transition, so the
   * declaration and the table have to agree** — and nothing but this block
   * makes that true. A target the table allows and no button offers is a move
   * nobody can make from the only screen an admin looks at, which is how a
   * batch a dead worker left `resolving` became unreachable. A button offering
   * a target the table refuses is a save that fails under the reviewer's hands.
   */
  describe('the buttons and the transition table', () => {
    const stages = (
      EventImports.admin?.components?.edit?.SaveButton as {
        clientProps: WorkflowActionsProps
      }
    ).clientProps.stages

    /** Re-resolving needs a corrected file, which no button can carry. */
    const FILE_ONLY = 'resolving'

    const targetsOf = (stage: string) =>
      (stages[stage] ?? [])
        .map((action) => action.overrides.status)
        .filter((status): status is string => typeof status === 'string')

    it('offers no button for a transition the table refuses', () => {
      for (const stage of Object.keys(stages).filter((key) => key !== CREATE_STAGE)) {
        for (const target of targetsOf(stage)) {
          expect(ALLOWED[stage as keyof typeof ALLOWED] ?? [], `${stage} → ${target}`).toContain(
            target,
          )
        }
      }
    })

    /**
     * ⚠ **What `transitionStatus`' stale-copy carve-out rests on.** It keeps the
     * stored rows for a move out of a stage with no review, and refuses an edit
     * to such a stage otherwise — so a zero-override button there would post the
     * browser's rows as an edit and be refused, which is the stranded-batch bug
     * again in the one path that rescues it. Every button outside `review` must
     * be a move.
     */
    it('offers only moves on a stage that takes no edits', () => {
      for (const [stage, actions] of Object.entries(stages)) {
        if (stage === CREATE_STAGE || stage === 'review') continue
        for (const action of actions ?? []) {
          expect(Object.keys(action.overrides), `${stage} — ${action.label}`).toContain('status')
        }
      }
    })

    it('offers a button for every transition the table allows', () => {
      for (const [stage, targets] of Object.entries(ALLOWED)) {
        for (const target of targets) {
          if (target === FILE_ONLY) continue
          expect(targetsOf(stage), `${stage} → ${target}`).toContain(target)
        }
      }
    })
  })

  describe('leaving a stage a job holds', () => {
    /**
     * ⚠ **The admin form posts the whole document, so Discard carries whatever
     * `rows` the browser loaded.** A batch is discarded from `resolving`
     * precisely when a worker died mid-run — and by then the resolve job has
     * written answers the open page never saw. Checking those rows as a
     * reviewer's edits refuses the save, which strands the one batch this
     * transition exists to rescue. Retry out of `failed` shares the mechanism.
     */
    it('accepts a discard carrying rows a job has since replaced', async () => {
      const batch = await createBatch({}, csvWith([classLine('Stale In The Browser')]))
      const asLoadedByTheBrowser = batch.rows

      await payload.update({
        collection: 'event-imports',
        id: batch.id,
        data: {
          rows: (batch.rows ?? []).map((row) => ({
            ...row,
            errors: ['Address lookup is not configured on this server.'],
          })),
        },
        overrideAccess: true,
        context: { eventImportJob: true },
      })

      const discarded = await payload.update({
        collection: 'event-imports',
        id: batch.id,
        data: { status: 'discarded', rows: asLoadedByTheBrowser },
        user: admin,
        overrideAccess: false,
      })

      expect(discarded.status).toBe('discarded')
      // The job's answers stand: the stale copy is dropped, not written back.
      expect(discarded.rows?.[0]?.errors).toEqual([
        'Address lookup is not configured on this server.',
      ])
    })

    /**
     * The refusal the case above must not have widened. A `PATCH` that moves
     * nothing is an edit, and a batch no longer in review does not take one.
     */
    it('still refuses an edit to a batch that is not moving', async () => {
      const batch = await createBatch({}, csvWith([classLine('Not Moving')]))

      expect(
        await fieldErrorMessage(
          payload.update({
            collection: 'event-imports',
            id: batch.id,
            data: {
              rows: (batch.rows ?? []).map((row) => ({ ...row, errors: ['invented'] })),
            },
            user: admin,
            overrideAccess: false,
          }),
          'rows',
        ),
      ).toMatch(/can no longer be edited/)
    })
  })
})
