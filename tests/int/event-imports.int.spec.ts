/**
 * The bulk class import end to end: the `imports` upload the plugin owns, the
 * fields and access this repo adds to it, and the job that turns each CSV row
 * into a draft class — run through the plugin's own task with our wrapper on
 * it, exactly as the queue would.
 *
 * `geocodeLocation` is the one function mocked: every town the fixtures name
 * resolves to a place id, and a city region holding that id is what a row is
 * filed under.
 */

import type { Payload, TaskConfig } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { SweepEventImports } from '@/jobs/SweepEventImports/SweepEventImports'
import type { GeocodedLocation, GeocodeOutcome } from '@/lib/mapbox/geocoder'
import { relationId } from '@/lib/utilities/relationId'
import type { Import } from '@/payload-types'
import { buildImportTemplate } from '@/plugins/eventImport/csv/template'

import { runTaskHandler } from '../utils/taskRunner'
import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const geocoder = vi.hoisted(() => ({ outcome: null as GeocodeOutcome | null }))

vi.mock('@/lib/mapbox/geocoder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mapbox/geocoder')>()),
  geocodeLocation: vi.fn(async (args: { address?: string | null; city: string }) => {
    if (geocoder.outcome) return geocoder.outcome
    return { status: 'found', location: locationFor(args.city, args.address ?? '') }
  }),
}))

function locationFor(city: string, address: string): GeocodedLocation {
  const slug = city.toLowerCase().replace(/\W+/g, '-')
  return {
    mapboxId: `addr.${slug}.${address.toLowerCase().replace(/\W+/g, '-')}`,
    featureType: 'address',
    latitude: 52.5 + slug.length / 100,
    longitude: 13.4 + address.length / 100,
    placeName: city,
    placeId: `place.${slug}`,
  }
}

const HEADER = buildImportTemplate().split('\n')[0]!.replace(/^﻿/, '')

function classLine(cells: Record<string, string>): string {
  const row: Record<string, string> = {
    title: 'Tuesday Evening Meditation',
    eventType: 'offline',
    country: 'DE',
    city: 'Berlin',
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

describe('class imports', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let admin: Awaited<ReturnType<typeof testData.createManager>>
  let country: number
  let berlin: number
  let importTask: TaskConfig<'createCollectionImport'>

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
    const city = await testData.createRegion(payload, {
      name: 'Berlin',
      level: 'city',
      parent: country,
      mapboxId: 'place.berlin',
    })
    berlin = city.id
    importTask = payload.config.jobs.tasks!.find(
      (task) => task.slug === 'createCollectionImport',
    ) as TaskConfig<'createCollectionImport'>
  })

  afterAll(async () => {
    await cleanup()
  })

  const createImport = (
    lines: readonly string[],
    user: Awaited<ReturnType<typeof testData.createManager>> = admin,
    data: Record<string, unknown> = {},
  ) =>
    payload.create({
      collection: 'imports',
      data: createData<'imports'>({ targetRegion: country, defaultLanguages: ['de'], ...data }),
      file: file(csvWith(lines)),
      user,
      overrideAccess: false,
    })

  const run = (importId: number) =>
    runTaskHandler(importTask, {
      payload,
      input: {
        importId: String(importId),
        importCollection: 'imports',
        userID: String(admin.id),
        userCollection: 'managers',
        batchSize: 50,
        defaultVersionStatus: 'draft',
        maxLimit: 500,
      },
    })

  const read = (id: number) =>
    payload.findByID({ collection: 'imports', id, depth: 0 }) as Promise<Import>

  const importedClasses = (importId: number) =>
    payload.find({
      collection: 'events',
      where: { importBatch: { equals: importId } },
      depth: 0,
      pagination: false,
      draft: true,
    })

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

  describe('the upload', () => {
    it('is stamped with the uploader and waits for the job', async () => {
      const other = await testData.createManager(payload, { name: 'Somebody Else' })
      const created = await createImport([classLine({})], admin, { manager: other.id })
      expect(created.status).toBe('pending')
      expect(relationId(created.manager)).toBe(admin.id)
      expect(created.collectionSlug).toBe('events')
    })

    it('refuses a target no import can file classes under', async () => {
      const venue = await testData.createRegion(payload, { level: 'venue', parent: berlin })
      expect(
        await fieldErrorMessage(
          createImport([classLine({})], admin, { targetRegion: venue.id }),
          'targetRegion',
        ),
      ).toMatch(/cannot take an import/)
    })

    it('refuses a region outside an atlas-manager’s subtree', async () => {
      const outsider = await testData.createManager(payload, {
        name: 'Other Country Manager',
        roles: ['atlas-manager'],
      })
      expect(
        await fieldErrorMessage(createImport([classLine({})], outsider), 'targetRegion'),
      ).toMatch(/do not manage that region/)
    })
  })

  describe('the job', () => {
    it('creates one draft class per row, filed under the city its town names', async () => {
      const created = await createImport([
        classLine({ title: 'Beginners' }),
        classLine({ title: 'Evening', address: 'Hauptstraße 1', startTime: '19:00', weekdays: 'WE', date: '2026-01-07' }),
      ])
      const output = (await run(created.id)) as { imported: number; errors: unknown[] }
      expect(output).toMatchObject({ imported: 2, errors: [] })

      const after = await read(created.id)
      expect(after.status).toBe('completed')
      const { docs } = await importedClasses(created.id)
      expect(docs.map((event) => event.title).sort()).toEqual(['Beginners', 'Evening'])
      // Each row links the class it created: row 1 Beginners, row 2 Evening.
      const byId = new Map(docs.map((event) => [event.id, event.title]))
      expect(after.results?.map(({ outcome, eventId }) => [outcome, byId.get(eventId!)])).toEqual([
        ['created', 'Beginners'],
        ['created', 'Evening'],
      ])
      for (const event of docs) {
        expect(event._status).toBe('draft')
        expect(typeof event.region === 'object' ? event.region.id : event.region).toBe(berlin)
        expect(event.languages).toEqual(['de'])
        expect(event.schedule?.firstDate_tz).toBe('Europe/Berlin')
      }
    })

    it('skips a row whose town has no city region, naming it', async () => {
      const created = await createImport([classLine({ title: 'Nowhere', city: 'Leipzig' })])
      await run(created.id)

      const after = await read(created.id)
      // Nothing imported and a row skipped: the plugin alone would say `completed`.
      expect(after.status).toBe('failed')
      expect(after.results).toHaveLength(1)
      expect(after.results?.[0]).toMatchObject({ row: 1, outcome: 'error', values: { title: 'Nowhere' } })
      expect(after.results?.[0]?.reasons?.[0]).toMatch(/no city region for "Leipzig"/)
      // What the page's "create it first" link prefills a new city with.
      expect(after.results?.[0]?.missingCity).toEqual({ name: 'Leipzig' })
    })

    it('skips a row that repeats a class already listed, with the plugin’s own reason', async () => {
      const first = await createImport([classLine({ title: 'Once' })])
      await run(first.id)
      const again = await createImport([classLine({ title: 'Twice' })])
      await run(again.id)

      const after = await read(again.id)
      expect(after.status).toBe('failed')
      expect(after.results).toHaveLength(1)
      expect(after.results?.[0]).toMatchObject({ outcome: 'duplicate' })
      expect(after.results?.[0]?.reasons?.[0]).toMatch(/repeats #\d+/)
      expect((await importedClasses(again.id)).totalDocs).toBe(0)
    })

    it('reports a bad column in the volunteer’s words before any geocode', async () => {
      const created = await createImport([classLine({ title: 'Bad time', startTime: 'six' })])
      await run(created.id)
      const after = await read(created.id)
      expect(after.results?.[0]?.reasons?.join(' ')).toMatch(/startTime must be HH:MM/)
    })

    it('links a manager by email, creating the account when none exists', async () => {
      const created = await createImport([
        classLine({
          title: 'Coordinated',
          address: 'Kastanienallee 7',
          startTime: '10:00',
          managerEmail: 'anna.new@example.org',
          managerName: 'Anna',
        }),
      ])
      await run(created.id)
      const [event] = (await importedClasses(created.id)).docs
      const managerId = typeof event!.manager === 'object' ? event!.manager?.id : event!.manager
      const manager = await payload.findByID({ collection: 'managers', id: managerId!, depth: 0 })
      expect(manager.email).toBe('anna.new@example.org')
      expect(manager.type).toBe('manager')
      expect(event!.verificationStage).toBe('verified')
    })

    it('fails the whole import, not the rows, when the geocoder is down', async () => {
      geocoder.outcome = { status: 'unavailable' }
      try {
        const created = await createImport([classLine({ title: 'Later' })])
        await expect(run(created.id)).rejects.toThrow(/did not answer/)
        const after = await read(created.id)
        expect(after.status).toBe('failed')
        expect(after.error).toMatch(/did not answer/)
      } finally {
        geocoder.outcome = null
      }
    })
  })

  describe('access', () => {
    it('shows a volunteer only their own imports', async () => {
      const owner = await testData.createManager(payload, {
        name: 'Germany Manager',
        roles: ['atlas-manager'],
      })
      await payload.update({ collection: 'regions', id: country, data: { managers: [owner.id] } })
      const mine = await createImport([classLine({})], owner)
      await createImport([classLine({})], admin)

      const seen = await payload.find({
        collection: 'imports',
        user: owner,
        overrideAccess: false,
        depth: 0,
        pagination: false,
      })
      expect(seen.docs.map((doc) => doc.id)).toEqual([mine.id])
    })

    it('refuses a published API client, which is what RESTRICTED_COLLECTIONS is for', async () => {
      const clientDoc = await testData.createClient(payload, admin.id, {
        name: 'Atlas Widget Key',
        roles: ['sahaj-atlas-client'],
      })
      await expect(
        payload.find({
          collection: 'imports',
          user: { id: clientDoc.id, collection: 'clients', _status: 'published', roles: ['sahaj-atlas-client'] } as never,
          overrideAccess: false,
        }),
      ).rejects.toThrow()
    })
  })

  describe('the sweep', () => {
    it('deletes an import past the retention window and nothing newer', async () => {
      const old = await createImport([classLine({})])
      const fresh = await createImport([classLine({})])
      await payload.db.updateOne({
        collection: 'imports',
        id: old.id,
        data: { updatedAt: '2020-01-01T00:00:00.000Z' },
      })

      const dry = await runTaskHandler(SweepEventImports, { payload, input: { dryRun: true } })
      expect(dry.deleted).toBe(1)
      expect(await read(old.id)).toBeTruthy()

      const real = await runTaskHandler(SweepEventImports, { payload, input: {} })
      expect(real.deleted).toBe(1)
      await expect(read(old.id)).rejects.toThrow()
      expect((await read(fresh.id)).id).toBe(fresh.id)
    })
  })
})
