/**
 * The bulk class import end to end: the `imports` upload, its access, and the
 * job that turns each CSV row into a draft class — run through the task's own
 * handler, exactly as the queue would.
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
import { MAX_IMPORT_ROWS } from '@/plugins/eventImport/constants'
import { buildImportTemplate } from '@/plugins/eventImport/csv/template'

import { runTaskHandler } from '../utils/taskRunner'
import { createData, testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

const geocoder = vi.hoisted(() => ({
  outcome: null as GeocodeOutcome | null,
  /** Overrides the match level, to stand for an address Mapbox placed only at the street. */
  featureType: 'address',
}))

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
    featureType: geocoder.featureType,
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
    recurrenceType: 'WEEKLY',
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
  let importTask: TaskConfig<'importEvents'>

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
      (task) => task.slug === 'importEvents',
    ) as TaskConfig<'importEvents'>
  })

  afterAll(async () => {
    await cleanup()
  })

  const createImport = (
    lines: readonly string[],
    user: Awaited<ReturnType<typeof testData.createManager>> = admin,
    data: Record<string, unknown> = {},
    upload = file(csvWith(lines)),
  ) =>
    payload.create({
      collection: 'imports',
      data: createData<'imports'>({ targetRegion: country, defaultLanguages: ['de'], ...data }),
      file: upload,
      user,
      overrideAccess: false,
    })

  const run = (importId: number) => runTaskHandler(importTask, { payload, input: { importId } })

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
      expect(created.rows).toBeUndefined() // never readable, not even by an admin
    })

    it.each([
      ['a file that is not a CSV', 'classes.xlsx', csvWith([classLine({})]), /Upload a CSV file/],
      ['an empty file', 'classes.csv', Buffer.from(''), /no classes/],
      ['a header with no rows', 'classes.csv', csvWith([]), /no classes/],
    ])('refuses %s at upload', async (_, name, data, message) => {
      expect(
        await fieldErrorMessage(createImport([], admin, {}, file(data, name)), 'file'),
      ).toMatch(message)
    })

    it('reads a header cell that carries an invisible character', async () => {
      const header = HEADER.replace('title', 'title\u200b')
      const created = await createImport(
        [],
        admin,
        {},
        file(
          Buffer.from(
            `${header}\n${classLine({ title: 'Hidden char', startTime: '06:05' })}\n`,
            'utf8',
          ),
        ),
      )
      await run(created.id)
      expect((await read(created.id)).results?.[0]).toMatchObject({
        outcome: 'created',
        title: 'Hidden char',
      })
    })

    it('refuses a target no import can file classes under, or none at all', async () => {
      const venue = await testData.createRegion(payload, { level: 'venue', parent: berlin })
      expect(
        await fieldErrorMessage(
          createImport([classLine({})], admin, { targetRegion: venue.id }),
          'targetRegion',
        ),
      ).toMatch(/invalid selection/)
      expect(
        await fieldErrorMessage(
          createImport([classLine({})], admin, { targetRegion: null }),
          'targetRegion',
        ),
      ).toMatch(/required/)
    })

    it('refuses a region outside an atlas-manager’s subtree', async () => {
      const outsider = await testData.createManager(payload, {
        name: 'Other Country Manager',
        roles: ['atlas-manager'],
      })
      expect(
        await fieldErrorMessage(createImport([classLine({})], outsider), 'targetRegion'),
      ).toMatch(/invalid selection/)
    })
  })

  describe('the job', () => {
    it('creates one draft class per row, filed under the city its town names', async () => {
      const created = await createImport([
        classLine({ title: 'Beginners' }),
        classLine({
          title: 'Evening',
          address: 'Hauptstraße 1',
          startTime: '19:00',
          weekdays: 'WE',
          date: '2026-01-07',
        }),
      ])
      await run(created.id)

      const after = await read(created.id)
      // Every class it created is a draft, so there is something to review.
      expect(after.status).toBe('review')
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

    it('moves to completed once no draft is left, and back while one is', async () => {
      const created = await createImport([
        classLine({ title: 'Publish me', startTime: '06:07' }),
        classLine({ title: 'Delete me', startTime: '06:08' }),
      ])
      await run(created.id)
      const [toPublish, toDelete] = (await importedClasses(created.id)).docs.sort(
        (a, b) => a.id - b.id,
      )
      expect((await read(created.id)).status).toBe('review')

      await payload.update({
        collection: 'events',
        id: toPublish!.id,
        data: { _status: 'published' },
        overrideAccess: true,
      })
      expect((await read(created.id)).status).toBe('review')

      await payload.delete({ collection: 'events', id: toDelete!.id, overrideAccess: true })
      expect((await read(created.id)).status).toBe('completed')

      await payload.update({
        collection: 'events',
        id: toPublish!.id,
        data: { _status: 'draft' },
        overrideAccess: true,
      })
      expect((await read(created.id)).status).toBe('review')
    })

    it('creates the rows the uploader may write and refuses the rest, naming why', async () => {
      // Owns Germany at the upload — then, before the job runs, only Berlin.
      const hamburg = await testData.createRegion(payload, {
        name: 'Hamburg',
        level: 'city',
        parent: country,
        mapboxId: 'place.hamburg',
      })
      const volunteer = await testData.createManager(payload, {
        name: 'Narrowed Volunteer',
        roles: ['atlas-manager'],
      })
      const germany = await payload.findByID({ collection: 'regions', id: country, depth: 0 })
      const owners = (germany.managers ?? []).map((m) => (typeof m === 'object' ? m.id : m))
      await payload.update({
        collection: 'regions',
        id: country,
        data: { managers: [...owners, volunteer.id] },
      })
      const created = await createImport(
        [
          classLine({ title: 'Allowed in Berlin', startTime: '06:09' }),
          classLine({ title: 'Refused in Hamburg', city: 'Hamburg', startTime: '06:10' }),
        ],
        volunteer,
      )
      await payload.update({ collection: 'regions', id: country, data: { managers: owners } })
      await payload.update({
        collection: 'regions',
        id: berlin,
        data: { managers: [volunteer.id] },
      })

      await run(created.id)

      const after = await read(created.id)
      expect(after.status).toBe('review')
      expect(after.results?.map(({ row, title, outcome }) => [row, title, outcome])).toEqual([
        [2, 'Allowed in Berlin', 'created'],
        [3, 'Refused in Hamburg', 'error'],
      ])
      expect(after.results?.[1]?.reasons?.[0]).toMatch(/not allowed to add classes/)
      const { docs } = await importedClasses(created.id)
      expect(docs.map((event) => relationId(event.region))).toEqual([berlin])
      expect(hamburg.id).not.toBe(berlin)
    })

    it('skips a row whose town has no city region, naming it', async () => {
      const created = await createImport([classLine({ title: 'Nowhere', city: 'Leipzig' })])
      await run(created.id)

      const after = await read(created.id)
      expect(after.status).toBe('failed')
      expect(after.results).toHaveLength(1)
      // Row 2: the spreadsheet's own line, header included.
      expect(after.results?.[0]).toMatchObject({
        row: 2,
        outcome: 'error',
        values: { title: 'Nowhere' },
      })
      expect(after.results?.[0]?.reasons?.[0]).toMatch(/no city region for "Leipzig"/)
      // What the page's "create it first" link prefills a new city with.
      expect(after.results?.[0]?.missingCity).toEqual({ name: 'Leipzig' })
    })

    it('skips a row that repeats a class already listed, linking that class', async () => {
      const first = await createImport([classLine({ title: 'Once', startTime: '06:06' })])
      await run(first.id)
      const [original] = (await importedClasses(first.id)).docs
      const again = await createImport([classLine({ title: 'Twice', startTime: '06:06' })])
      await run(again.id)

      const after = await read(again.id)
      expect(after.status).toBe('failed')
      expect(after.results).toHaveLength(1)
      expect(after.results?.[0]).toMatchObject({
        outcome: 'duplicate',
        duplicateOf: { eventId: original!.id, title: 'Once' },
      })
      expect((await importedClasses(again.id)).totalDocs).toBe(0)
    })

    it('skips a row that repeats an earlier row of the same file', async () => {
      const created = await createImport([
        classLine({ title: 'Twin one', startTime: '06:01' }),
        classLine({ title: 'Twin two', startTime: '06:01' }),
      ])
      await run(created.id)
      const after = await read(created.id)
      expect(after.results?.map(({ row, outcome }) => [row, outcome])).toEqual([
        [2, 'created'],
        [3, 'duplicate'],
      ])
      expect(after.results?.[1]?.duplicateOf).toEqual({ row: 2 })
    })

    it('keeps every class around a blank row, with the lines the spreadsheet shows', async () => {
      const blank = HEADER.split(',')
        .map(() => '')
        .join(',')
      const created = await createImport([
        classLine({ title: 'Before blank', startTime: '06:02' }),
        blank,
        classLine({ title: 'After blank', startTime: '06:03' }),
      ])
      await run(created.id)
      const after = await read(created.id)
      expect(after.results?.map(({ row, title }) => [row, title])).toEqual([
        [2, 'Before blank'],
        [4, 'After blank'],
      ])
    })

    it('opens no manager account for a row that is skipped', async () => {
      const created = await createImport([
        classLine({
          title: 'Skipped with manager',
          city: 'Leipzig',
          managerEmail: 'never.opened@example.org',
        }),
      ])
      await run(created.id)
      const { totalDocs } = await payload.count({
        collection: 'managers',
        where: { email: { equals: 'never.opened@example.org' } },
      })
      expect(totalDocs).toBe(0)
    })

    it('refuses a town outside a city target instead of filing it there', async () => {
      const created = await createImport(
        [classLine({ title: 'Elsewhere', city: 'Hamburg' })],
        admin,
        {
          targetRegion: berlin,
        },
      )
      await run(created.id)
      const after = await read(created.id)
      expect(after.results?.[0]?.reasons?.[0]).toMatch(/"Hamburg" is not in Berlin/)
    })

    it('imports an address placed only at the street, without an address id', async () => {
      geocoder.featureType = 'street'
      try {
        const created = await createImport([
          classLine({ title: 'Street only', startTime: '06:04' }),
        ])
        await run(created.id)
        const [event] = (await importedClasses(created.id)).docs
        expect(event!.address?.mapboxId ?? null).toBeNull()
      } finally {
        geocoder.featureType = 'address'
      }
    })

    it('reports a bad column in the volunteer’s words', async () => {
      const created = await createImport([classLine({ title: 'Bad time', startTime: 'six' })])
      await run(created.id)
      const after = await read(created.id)
      expect(after.results?.[0]?.reasons?.join(' ')).toMatch(/startTime must be HH:MM/)
    })

    /**
     * ⚠ Pins `validate.ts`'s use of `beforeChangeTraverseFields`, which `payload`
     * exports but does not document: a draft create skips validation, so this
     * pass is the only thing that refuses these values before the publish.
     */
    it('refuses what the Events fields refuse, under the column that held it', async () => {
      const created = await createImport([
        classLine({ title: 'x'.repeat(101), startTime: '07:00' }),
        classLine({ title: 'Bare website', website: 'www.example.org', startTime: '07:30' }),
        classLine({ title: 'Bad contact', contactEmail: 'not-an-email', startTime: '08:00' }),
        classLine({ title: 'Bad language', languages: 'xx', startTime: '08:30' }),
        classLine({ title: 'Late end', endTime: '08:00', startTime: '09:00' }),
        classLine({ title: 'Long gap', interval: '100', startTime: '09:30' }),
        classLine({ title: 'Valid', startTime: '10:00' }),
      ])
      await run(created.id)
      const after = await read(created.id)
      const reasons = Object.fromEntries(
        (after.results ?? []).map(({ title, reasons = [] }) => [
          title.slice(0, 12),
          reasons.join('; '),
        ]),
      )
      expect(reasons).toMatchObject({
        xxxxxxxxxxxx: expect.stringMatching(/^title: /),
        'Bare website': expect.stringMatching(/^website: /),
        'Bad contact': expect.stringMatching(/^contactEmail: /),
        'Bad language': expect.stringMatching(/^languages: /),
        'Late end': expect.stringMatching(/^endTime: End time must be after start time/),
        'Long gap': expect.stringMatching(/^interval: /),
        Valid: '',
      })
      expect((await importedClasses(created.id)).docs.map(({ title }) => title)).toEqual(['Valid'])
    })

    it(
      'imports a file at the row limit, every row a class with its line',
      { timeout: 300_000 },
      async () => {
        const lines = Array.from({ length: MAX_IMPORT_ROWS }, (_, at) => {
          const minutes = 6 * 60 + at
          const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
          return classLine({
            title: `Limit class ${at + 1}`,
            address: 'Limitstraße 1',
            startTime: time,
          })
        })
        const created = await createImport(lines)
        const started = Date.now()
        await run(created.id)
        const seconds = (Date.now() - started) / 1000

        const after = await read(created.id)
        expect(after.status).toBe('review')
        expect(after.results).toHaveLength(MAX_IMPORT_ROWS)
        expect(
          after.results?.every(({ outcome, eventId }) => outcome === 'created' && eventId),
        ).toBe(true)
        expect(after.results?.at(-1)).toMatchObject({
          row: MAX_IMPORT_ROWS + 1,
          title: `Limit class ${MAX_IMPORT_ROWS}`,
        })
        expect((await importedClasses(created.id)).totalDocs).toBe(MAX_IMPORT_ROWS)
        // Logged, not asserted: CI machines vary. The geocoder is stubbed, so this
        // is the CMS's own cost per row.
        console.info(`${MAX_IMPORT_ROWS}-row import ran in ${seconds.toFixed(1)}s`)
      },
    )

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
    it('lists Event Imports for an atlas-manager, and refuses a manager who cannot create classes', async () => {
      const volunteer = await testData.createManager(payload, {
        name: 'Lister',
        roles: ['atlas-manager'],
      })
      const hidden = payload.collections.imports.config.admin.hidden as (args: {
        user: unknown
      }) => boolean
      expect(hidden({ user: volunteer })).toBe(false)

      const noRoles = await testData.createManager(payload, { name: 'No roles' })
      await expect(createImport([classLine({})], noRoles)).rejects.toThrow()
    })

    it('shows a manager the imports into their regions, whoever uploaded them', async () => {
      const owner = await testData.createManager(payload, {
        name: 'Austria Manager',
        roles: ['atlas-manager'],
      })
      const austria = await testData.createRegion(payload, {
        name: 'Austria',
        slug: 'at',
        level: 'country',
        managers: [owner.id],
      })
      const mine = await createImport([classLine({})], owner, { targetRegion: austria.id })
      const colleagues = await createImport([classLine({})], admin, { targetRegion: austria.id })
      await createImport([classLine({})], admin)

      const seen = await payload.find({
        collection: 'imports',
        user: owner,
        overrideAccess: false,
        depth: 0,
        pagination: false,
        sort: 'id',
      })
      expect(seen.docs.map((doc) => doc.id)).toEqual([mine.id, colleagues.id])
    })

    it('opens the create form on the region a Regions page links it to', () => {
      const field = payload.collections.imports.config.fields.find(
        (candidate) => 'name' in candidate && candidate.name === 'targetRegion',
      ) as { defaultValue: (args: { req: { query: Record<string, unknown> } }) => unknown }
      expect(field.defaultValue({ req: { query: { targetRegion: String(berlin) } } })).toBe(berlin)
      expect(field.defaultValue({ req: { query: { targetRegion: 'x' } } })).toBeUndefined()
      expect(field.defaultValue({ req: { query: {} } })).toBeUndefined()
    })

    it('refuses a published API client, which is what RESTRICTED_COLLECTIONS is for', async () => {
      const clientDoc = await testData.createClient(payload, admin.id, {
        name: 'Atlas Widget Key',
        roles: ['sahaj-atlas-client'],
      })
      await expect(
        payload.find({
          collection: 'imports',
          user: {
            id: clientDoc.id,
            collection: 'clients',
            _status: 'published',
            roles: ['sahaj-atlas-client'],
          } as never,
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
