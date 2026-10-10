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
 * The jobs, the status transitions and the commit arrive in later phases and
 * are covered with them.
 */

import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildImportTemplate } from '@/collections/EventImports/csv/template'
import { getDocManagerFields } from '@/plugins/access/documentManagers'

import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

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
     * a field value, so field access cannot deny it without denying them too —
     * `hooks/transitionStatus.ts` is the gate, and it arrives in phase 2 with
     * the jobs it releases. Until then a batch's `status` is writable and moves
     * nothing, because nothing reads it yet.
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
})
