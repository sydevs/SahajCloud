/**
 * Phase 2 of #907: the status transitions and the three jobs that do the work.
 *
 * ⚠ **The geocoder is the one thing mocked, and only the one function.** It is
 * the sole network call in the whole pipeline; everything else — the proposal,
 * the region writes, the coordinator accounts, the classes — runs against the
 * real collections, because what this spec is for is the parts of the commit no
 * pure test can reach: `Events.importKey`'s unique index, `Regions.parent`'s own
 * validator, and the access-elevating writes.
 *
 * ⚠ **The transition assertions read rows back through `overrideAccess: false`
 * where the caller matters.** `status`, `rows` and `progress` carry no field
 * access that stops the uploader (that is the design — the review edits two of
 * them), so `transitionStatus` is the only gate and a `hasPermission` assertion
 * would pass while it was open.
 *
 * Fixture pre-mortem: the geocoder stub returns a `GeocodedLocation` whose
 * `featureType: 'address'` and `confidence: 'exact'` are what `resolveRow`'s
 * match grading requires for a non-approximate answer — checked against
 * `src/collections/EventImports/resolve/resolveRow.ts`'s `gradeMatch`, not
 * guessed. Every CSV line is built from `buildImportTemplate()`'s own header, so
 * a column added or reordered upstream cannot shift every value one place and
 * still parse.
 */

import type { Payload } from 'payload'

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildImportTemplate } from '@/collections/EventImports/csv/template'
import { CommitEventImport } from '@/jobs/CommitEventImport/CommitEventImport'
import { ResolveEventImport } from '@/jobs/ResolveEventImport/ResolveEventImport'
import { SweepEventImports } from '@/jobs/SweepEventImports/SweepEventImports'
import type { GeocodedLocation, GeocodeOutcome } from '@/lib/mapbox/geocoder'
import type { EventImport, EventImportRows } from '@/payload-types'

import { runTaskHandler } from '../utils/taskRunner'
import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/** What the stub answers with, so a case can make the geocoder fail. */
const geocoder = vi.hoisted(() => ({ outcome: null as GeocodeOutcome | null }))

vi.mock('@/lib/mapbox/geocoder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mapbox/geocoder')>()),
  geocodeLocation: vi.fn(async (args: { address?: string | null; city: string }) => {
    if (geocoder.outcome) return geocoder.outcome
    return {
      status: 'found',
      location: locationFor(args.city, args.address ?? ''),
    } as GeocodeOutcome
  }),
}))

/**
 * A deterministic answer per city and address.
 *
 * ⚠ **One `mapboxId` per address, one `placeId` per city.** The proposal clusters
 * venues on the feature id and matches cities on the place id
 * (`propose/cluster.ts`, `propose/match.ts`), so a constant for either would
 * merge every hall into one venue or every town into one city.
 */
function locationFor(city: string, address: string): GeocodedLocation {
  const slug = city.toLowerCase().replace(/\W+/g, '-')
  return {
    mapboxId: `addr.${slug}.${address.toLowerCase().replace(/\W+/g, '-')}`,
    featureType: 'address',
    latitude: 52.5 + slug.length / 100,
    longitude: 13.4 + address.length / 100,
    countryCode: 'DE',
    subdivisionCode: 'DE-BE',
    regionMapboxId: 'region.de-be',
    placeName: city,
    placeId: `place.${slug}`,
    confidence: 'exact',
    streetMatched: true,
    placeMatched: true,
    matchedAddress: `${address}, ${city}`,
  }
}

const HEADER = buildImportTemplate().split('\n')[0]!.replace(/^﻿/, '')

/** One offline weekly class, in the template's own column order. */
function classLine(cells: Record<string, string>): string {
  const row: Record<string, string> = {
    eventType: 'offline',
    country: 'DE',
    city: 'Berlin',
    // Required of an offline class, so a default keeps a case that does not
    // care about the address from failing the parse rather than what it tests.
    address: 'Oranienstraße 25',
    scheduleType: 'weekly',
    date: '2026-01-06',
    startTime: '18:30',
    weekdays: 'TU',
    ...cells,
  }
  return HEADER.split(',')
    .map((column) => row[column] ?? '')
    .join(',')
}

const csvWith = (lines: readonly string[]) =>
  Buffer.from(`${HEADER}\n${lines.join('\n')}\n`, 'utf8')

const file = (data: Buffer, name = 'classes.csv') => ({
  data,
  mimetype: 'text/csv',
  name,
  size: data.length,
})

describe('event import jobs', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let admin: Awaited<ReturnType<typeof testData.createManager>>
  let country: number

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    admin = await testData.createManager(payload, { name: 'Import Admin', type: 'admin' })
    const germany = await testData.createRegion(payload, {
      name: 'Germany',
      slug: 'de',
      level: 'country',
    })
    country = germany.id
  })

  afterAll(async () => {
    await cleanup()
  })

  beforeEach(() => {
    geocoder.outcome = null
  })

  const createBatch = (lines: readonly string[], name?: string) =>
    payload.create({
      collection: 'event-imports',
      data: createData<'event-imports'>({ targetRegion: country, defaultLanguages: ['de'] }),
      file: file(csvWith(lines), name),
      user: admin,
      overrideAccess: false,
    })

  const read = (id: number) =>
    payload.findByID({ collection: 'event-imports', id, depth: 0 }) as Promise<EventImport>

  const resolve = (batchId: number) =>
    runTaskHandler(ResolveEventImport, { payload, input: { batchId } })

  const commit = (batchId: number) =>
    runTaskHandler(CommitEventImport, { payload, input: { batchId } })

  /** The per-field message off a refused write, which is what the form renders. */
  const refusal = async (write: Promise<unknown>, path: string): Promise<string> => {
    try {
      await write
      throw new Error(`expected the write to be refused on "${path}"`)
    } catch (error) {
      const data = (error as { data?: { errors?: { path: string; message: string }[] } }).data
      const match = (data?.errors ?? []).find((entry) => entry.path === path)
      if (!match) throw error
      return match.message
    }
  }

  describe('resolve', () => {
    it('geocodes every row, proposes a tree, and lands in review', async () => {
      const batch = await createBatch([
        classLine({ title: 'Berlin Tuesday', address: 'Oranienstraße 25' }),
        classLine({ title: 'Munich Tuesday', city: 'Munich', address: 'Sendlinger Str. 1' }),
      ])

      const output = await resolve(batch.id)
      expect(output).toMatchObject({ status: 'review', resolved: 2, pending: 0 })

      const resolved = await read(batch.id)
      expect(resolved.status).toBe('review')
      expect(resolved.progress).toMatchObject({ done: 2, total: 2 })
      // Two towns, so two city nodes under the country — the state layer needs
      // more than this to be worth proposing.
      expect(resolved.proposedRegions?.nodes.map((node) => node.name).sort()).toEqual([
        'Berlin',
        'Munich',
      ])
      expect(resolved.proposedRegions?.nodes.every((node) => node.match.kind === 'create')).toBe(
        true,
      )
    })

    it('does nothing to a batch that has moved on', async () => {
      const batch = await createBatch([classLine({ title: 'Already reviewed' })])
      await resolve(batch.id)

      // A second run is what the queue's autoRun net can produce, and it must
      // not overwrite a review in progress.
      expect(await resolve(batch.id)).toMatchObject({ status: 'review', resolved: 0 })
    })

    it('marks the second copy of a class in one file as a repeat of the first', async () => {
      const batch = await createBatch([
        classLine({ title: 'Original', address: 'Kottbusser Damm 1' }),
        classLine({ title: 'Copy', address: 'Kottbusser Damm 1' }),
      ])
      await resolve(batch.id)

      const rows = ((await read(batch.id)).rows ?? []) as EventImportRows
      expect(rows[0]?.duplicate).toBeUndefined()
      expect(rows[1]?.duplicate).toMatchObject({ line: 2 })
    })

    it('fails the batch, with the reason, when the geocoder is not configured', async () => {
      geocoder.outcome = { status: 'unconfigured', httpStatus: null }
      const batch = await createBatch([classLine({ title: 'No geocoder' })])

      await expect(resolve(batch.id)).rejects.toThrow(/not configured/)

      const failed = await read(batch.id)
      // The status stays `resolving` on a non-final attempt: Payload's `onFail`
      // is what moves it once the retries are spent.
      expect(failed.status).toBe('resolving')
      expect(failed.error).toMatch(/not configured/)
    })

    it('writes a row’s own fault onto the row and carries on', async () => {
      geocoder.outcome = { status: 'refused', httpStatus: 422 }
      const batch = await createBatch([classLine({ title: 'Unfindable' })])

      const output = await resolve(batch.id)
      expect(output).toMatchObject({ status: 'review', resolved: 0, pending: 0 })

      const rows = ((await read(batch.id)).rows ?? []) as EventImportRows
      expect(rows[0]?.errors?.join(' ')).toMatch(/HTTP 422/)
    })
  })

  describe('transitions', () => {
    const reviewed = async (lines: readonly string[]) => {
      const batch = await createBatch(lines)
      await resolve(batch.id)
      return batch.id
    }

    it('refuses a status no batch in review may take', async () => {
      const id = await reviewed([classLine({ title: 'Terminal' })])

      expect(
        await refusal(
          payload.update({
            collection: 'event-imports',
            id,
            data: { status: 'finished' },
            user: admin,
            overrideAccess: false,
          }),
          'status',
        ),
      ).toMatch(/cannot be finished/)
    })

    it('refuses a re-resolve with no new file', async () => {
      const id = await reviewed([classLine({ title: 'No file' })])

      expect(
        await refusal(
          payload.update({
            collection: 'event-imports',
            id,
            data: { status: 'resolving' },
            user: admin,
            overrideAccess: false,
          }),
          'file',
        ),
      ).toMatch(/Upload a corrected file/)
    })

    it('resets the batch on a re-upload, and resolves it again', async () => {
      const id = await reviewed([classLine({ title: 'First try' })])

      await payload.update({
        collection: 'event-imports',
        id,
        data: {},
        file: file(csvWith([classLine({ title: 'Second try' })]), 'corrected.csv'),
        user: admin,
        overrideAccess: false,
      })

      const reset = await read(id)
      expect(reset.status).toBe('resolving')
      expect(reset.proposedRegions).toBeFalsy()
      expect((reset.rows as EventImportRows)[0]?.values?.title).toBe('Second try')

      await resolve(id)
      expect((await read(id)).status).toBe('review')
    })

    it('refuses an edit to a row beyond its duplicate decision', async () => {
      const id = await reviewed([classLine({ title: 'Edited' })])
      const rows = ((await read(id)).rows ?? []) as EventImportRows

      expect(
        await refusal(
          payload.update({
            collection: 'event-imports',
            id,
            data: { rows: [{ ...rows[0]!, committed: { eventId: 999 } }] },
            user: admin,
            overrideAccess: false,
          }),
          'rows',
        ),
      ).toMatch(/only the skip-or-import choice/)
    })

    it('accepts a duplicate decision', async () => {
      const id = await reviewed([
        classLine({ title: 'Original', address: 'Skalitzer Str. 5' }),
        classLine({ title: 'Copy', address: 'Skalitzer Str. 5' }),
      ])
      const rows = ((await read(id)).rows ?? []) as EventImportRows

      await payload.update({
        collection: 'event-imports',
        id,
        data: {
          rows: [rows[0]!, { ...rows[1]!, duplicate: { ...rows[1]!.duplicate!, action: 'import' } }],
        },
        user: admin,
        overrideAccess: false,
      })

      const saved = ((await read(id)).rows ?? []) as EventImportRows
      expect(saved[1]?.duplicate?.action).toBe('import')
      expect(saved.length).toBe(2)
    })

    it('refuses an edit once the batch is no longer in review', async () => {
      const batch = await createBatch([classLine({ title: 'Mid-resolve' })])
      const rows = (batch.rows ?? []) as EventImportRows

      expect(
        await refusal(
          payload.update({
            collection: 'event-imports',
            id: batch.id,
            data: { rows: [{ ...rows[0]!, values: { ...rows[0]!.values, title: 'Rewritten' } }] },
            user: admin,
            overrideAccess: false,
          }),
          'rows',
        ),
      ).toMatch(/can no longer be edited/)
    })

    /**
     * ⚠ **Payload back-fills `rows` and `proposedRegions` into `data` on every
     * update**, so a hook testing for their presence refuses writes that never
     * named them — which is what the phase-1 field-lock case caught.
     */
    it('accepts an unrelated update that names neither column', async () => {
      const batch = await createBatch([classLine({ title: 'Untouched' })])

      const updated = await payload.update({
        collection: 'event-imports',
        id: batch.id,
        data: { manager: admin.id } as never,
        user: admin,
        overrideAccess: false,
        depth: 0,
      })
      expect(updated.status).toBe('resolving')
    })

    it('refuses a commit while a row is still pending', async () => {
      // A batch nobody resolved has every row pending, which is the state the
      // Commit button must not be able to pass.
      const batch = await createBatch([classLine({ title: 'Unresolved' })])
      await payload.update({
        collection: 'event-imports',
        id: batch.id,
        data: { status: 'review' },
        overrideAccess: true,
        context: { eventImportJob: true },
      })

      expect(
        await refusal(
          payload.update({
            collection: 'event-imports',
            id: batch.id,
            data: { status: 'committing' },
            user: admin,
            overrideAccess: false,
          }),
          'status',
        ),
      ).toMatch(/no address yet/)
    })
  })

  describe('commit', () => {
    const committed = async (lines: readonly string[]) => {
      const batch = await createBatch(lines)
      await resolve(batch.id)
      await payload.update({
        collection: 'event-imports',
        id: batch.id,
        data: { status: 'committing' },
        user: admin,
        overrideAccess: false,
      })
      return batch.id
    }

    it('creates the regions and one class per row, and finishes', async () => {
      const id = await committed([
        classLine({ title: 'Hamburg Tuesday', city: 'Hamburg', address: 'Reeperbahn 1' }),
      ])

      const output = await commit(id)
      expect(output).toMatchObject({ status: 'finished', committed: 1, skipped: 0 })

      const finished = await read(id)
      expect(finished.status).toBe('finished')
      expect(finished.report?.committed).toHaveLength(1)

      const { docs } = await payload.find({
        collection: 'events',
        where: { importKey: { equals: `${id}:2` } },
        depth: 1,
        overrideAccess: true,
      })
      expect(docs).toHaveLength(1)
      const event = docs[0]!
      expect(event.title).toBe('Hamburg Tuesday')
      // No coordinator was named, so the class is published with nobody
      // vouching for it.
      expect(event.verificationStage).toBe('unverified')
      expect(event.manager).toBeFalsy()
      const region = typeof event.region === 'object' ? event.region : null
      expect(region?.name).toBe('Hamburg')
      expect(region?.level).toBe('city')
    })

    it('creates no second class when the job runs again', async () => {
      const id = await committed([
        classLine({ title: 'Bremen Tuesday', city: 'Bremen', address: 'Marktplatz 1' }),
      ])
      await commit(id)

      const before = await payload.count({
        collection: 'events',
        where: { importKey: { like: `${id}:` } },
        overrideAccess: true,
      })

      // A finished batch refuses the work outright, which is the first guard.
      expect(await commit(id)).toMatchObject({ status: 'finished', committed: 0 })

      // And with the status forced back — and the rows' own `committed` cleared,
      // which is the state a run that died before its write-back leaves —
      // `importKey` is the second guard.
      const rows = ((await read(id)).rows ?? []) as EventImportRows
      await payload.update({
        collection: 'event-imports',
        id,
        data: {
          status: 'committing',
          rows: rows.map(({ committed: _committed, ...row }) => row),
        },
        overrideAccess: true,
        context: { eventImportJob: true },
      })
      expect(await commit(id)).toMatchObject({ committed: 1, skipped: 0 })

      const after = await payload.count({
        collection: 'events',
        where: { importKey: { like: `${id}:` } },
        overrideAccess: true,
      })
      expect(after.totalDocs).toBe(before.totalDocs)

      // ⚠ **Adopted, not refused.** Without the `importKey` lookup the unique
      // index would also hold the count — by rejecting the create and reporting
      // the row as skipped, which is a class the volunteer is told was not
      // imported.
      const replayed = ((await read(id)).rows ?? []) as EventImportRows
      expect(replayed[0]?.committed?.eventId).toBeTypeOf('number')
      expect(replayed[0]?.errors ?? []).toEqual([])
    })

    it('opens an account for a coordinator the file names, with no roles', async () => {
      const email = `coordinator-${Date.now()}@example.test`
      const id = await committed([
        classLine({
          title: 'Leipzig Tuesday',
          city: 'Leipzig',
          address: 'Markt 1',
          managerName: 'Lena Fischer',
          managerEmail: email,
        }),
      ])
      await commit(id)

      const { docs } = await payload.find({
        collection: 'managers',
        where: { email: { equals: email } },
        depth: 0,
        overrideAccess: true,
      })
      expect(docs).toHaveLength(1)
      expect(docs[0]).toMatchObject({ type: 'manager', name: 'Lena Fischer' })
      // ⚠ No roles at all: a coordinator an import opened must not inherit the
      // uploader's authority anywhere.
      expect(docs[0]?.roles ?? null).toBeFalsy()
    })

    it('skips a duplicate by default and reports why', async () => {
      const id = await committed([
        classLine({ title: 'Kiel First', city: 'Kiel', address: 'Holstenstraße 1' }),
        classLine({ title: 'Kiel Second', city: 'Kiel', address: 'Holstenstraße 1' }),
      ])

      expect(await commit(id)).toMatchObject({ committed: 1, skipped: 1 })

      const report = (await read(id)).report
      expect(report?.skipped).toHaveLength(1)
      expect(report?.skipped[0]?.reasons.join(' ')).toMatch(/repeat of line 2/)
      // The skipped line keeps its own values, so the volunteer can download,
      // fix and re-upload it after the batch is gone.
      expect(report?.skipped[0]?.values?.title).toBe('Kiel Second')
    })

    it('never modifies an existing class', async () => {
      const id = await committed([
        classLine({ title: 'Essen First', city: 'Essen', address: 'Kettwiger Str. 1' }),
      ])
      await commit(id)

      const { docs } = await payload.find({
        collection: 'events',
        where: { importKey: { equals: `${id}:2` } },
        depth: 0,
        overrideAccess: true,
      })
      const existing = docs[0]!

      // The same class again, which the commit finds as a repeat of a published
      // class rather than of an earlier line.
      const second = await committed([
        classLine({ title: 'Essen Renamed', city: 'Essen', address: 'Kettwiger Str. 1' }),
      ])
      expect(await commit(second)).toMatchObject({ committed: 0, skipped: 1 })

      const unchanged = await payload.findByID({
        collection: 'events',
        id: existing.id,
        depth: 0,
        overrideAccess: true,
      })
      expect(unchanged.title).toBe('Essen First')
      expect(unchanged.updatedAt).toBe(existing.updatedAt)
    })
  })

  describe('sweep', () => {
    it('deletes a discarded batch and leaves a live one', async () => {
      const discarded = await createBatch([classLine({ title: 'Discarded' })], 'discarded.csv')
      await resolve(discarded.id)
      await payload.update({
        collection: 'event-imports',
        id: discarded.id,
        data: { status: 'discarded' },
        user: admin,
        overrideAccess: false,
      })

      const live = await createBatch([classLine({ title: 'Live' })], 'live.csv')

      expect(await runTaskHandler(SweepEventImports, { payload })).toMatchObject({ deleted: 1 })

      await expect(read(discarded.id)).rejects.toThrow()
      expect((await read(live.id)).id).toBe(live.id)
    })

    it('deletes a batch untouched for longer than the window, whatever its status', async () => {
      const stale = await createBatch([classLine({ title: 'Stale' })], 'stale.csv')

      // The clock is injected rather than the row back-dated: `updatedAt` is
      // Payload's to write, and a hand-set value would be overwritten by the
      // very update that set it.
      const output = await runTaskHandler(SweepEventImports, {
        payload,
        input: { now: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString() },
      })
      expect(output.deleted).toBeGreaterThanOrEqual(1)
      await expect(read(stale.id)).rejects.toThrow()
    })
  })
})
