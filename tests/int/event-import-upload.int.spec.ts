/**
 * The upload and template endpoints (#828): who may stage a batch, and what the
 * staged batch holds.
 *
 * ⚠ **This is the feature's only role check, so these are the cases that keep
 * the later endpoints' ownership-only gate sound.** Resolve, propose and commit
 * all ask "is this batch yours", never "may you create classes" — which is
 * right only while a batch could not have been created without the grant.
 *
 * ⚠ **The locale gate is driven through the REST pipeline, and only it can see
 * the gate at all** (#701). A hand-built `req` carries whatever `roles` the
 * fixture read back — a flat array for a manager created at one locale — and
 * `extractRoles` returns a flat array whatever scope it is asked for, so every
 * locale passes. Nothing but a real request derives `req.locale`, which is also
 * the only way to ask what a call naming no locale does.
 *
 * `parseImportCsv` has its own spec. What is asserted here is what only a
 * database can answer — the grant, the subtree, the target's level, and the
 * columns the create writes.
 */
import type { RestClient } from '../utils/restRequest'
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { MAX_IMPORT_ROWS } from '@/collections/EventImports/constants'
import { IMPORT_TEMPLATE_FILENAME } from '@/collections/EventImports/csv/template'
import { eventImportTemplate } from '@/collections/EventImports/endpoints/template'
import { uploadEventImport } from '@/collections/EventImports/endpoints/upload'
import type { Client, EventImport, Manager, Region } from '@/payload-types'

import { createRestClientAs } from '../utils/restRequest'
import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/** Only the columns every row owes, plus the offline pair. */
const HEADER = 'title,eventType,country,city,address,scheduleType'
const OFFLINE = 'Tuesday Meditation,offline,DE,Berlin,Oranienstraße 25,weekly'

function csvWithRows(count: number): string {
  return [HEADER, ...Array.from({ length: count }, () => OFFLINE)].join('\n')
}

interface UploadBody {
  targetRegion?: unknown
  csv?: unknown
  defaultLanguages?: unknown
}

describe('upload endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let env: Awaited<ReturnType<typeof createTestEnvironment>>
  let restAsGermanOnly: RestClient
  let admin: Manager
  let uploader: Manager
  let germanOnlyManager: Manager
  let outsider: Manager
  let inactiveManager: Manager
  let client: Client
  let germany: Region
  let berlinCity: Region
  let berlinHall: Region

  const reqAs = (
    user: Manager | Client,
    body: UploadBody | null,
    locale = 'en',
  ): PayloadRequest =>
    ({
      payload,
      headers: new Headers(),
      user,
      locale,
      context: {},
      // ⚠ **What a real bodiless POST does.** `Request.json()` rejects on an
      // empty body and Payload populates no `req.data` for a custom endpoint,
      // so a handler reading a body has to answer 400 rather than throw.
      json: async () => {
        if (body === null) throw new SyntaxError('Unexpected end of JSON input')
        return body
      },
    }) as unknown as PayloadRequest

  async function upload(
    user: Manager | Client,
    body: UploadBody | null,
    locale = 'en',
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = (await uploadEventImport.handler(reqAs(user, body, locale))) as Response
    return { status: response.status, body: (await response.json()) as Record<string, unknown> }
  }

  const validBody = (overrides: UploadBody = {}): UploadBody => ({
    targetRegion: germany.id,
    csv: `${HEADER}\n${OFFLINE}`,
    defaultLanguages: ['de'],
    ...overrides,
  })

  const readBatch = (id: number): Promise<EventImport> =>
    payload.findByID({ collection: 'event-imports', id, depth: 0, overrideAccess: true })

  beforeAll(async () => {
    env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    admin = env.adminUser

    uploader = await testData.createManager(payload, {
      name: 'Upload Uploader',
      email: 'upload-uploader@example.com',
      roles: ['atlas-manager'],
    })
    // The manager in #701's report: a grant in one locale only. Both cases below
    // are this one manager, so the difference asserted is the request's locale
    // and nothing else.
    germanOnlyManager = await testData.createManager(payload, {
      name: 'Upload German Coordinator',
      email: 'upload-de@example.com',
      roles: { de: ['atlas-manager'] },
    })
    outsider = await testData.createManager(payload, {
      name: 'Upload Outsider',
      email: 'upload-outsider@example.com',
      roles: ['atlas-manager'],
    })
    inactiveManager = await testData.createManager(payload, {
      name: 'Upload Retired',
      email: 'upload-retired@example.com',
      type: 'inactive' as const,
      roles: ['atlas-manager'],
    })
    client = await testData.createClient(payload, admin.id, {
      name: 'Upload Atlas Widget',
      roles: ['sahaj-atlas-client'],
    })

    // ⚠ The name is the fixture, not decoration: the country code is read off
    // the chain, so a region called "Test Country" resolves to no ISO country
    // and every batch under it is refused for that instead.
    germany = await testData.createRegion(payload, {
      name: 'Germany',
      level: 'country',
      managers: [uploader.id, germanOnlyManager.id],
    })
    berlinCity = await testData.createRegion(payload, {
      name: 'Berlin',
      level: 'city',
      parent: germany.id,
    })
    berlinHall = await testData.createRegion(payload, {
      name: 'Kreuzberg Hall',
      level: 'venue',
      parent: berlinCity.id,
    })
    // ⚠ The outsider has to manage *something*, or `ownedRegionFilterOptions`
    // answers `false` and the 403 reports "you manage no region" — which passes
    // a subtree test without the subtree check ever running.
    await testData.createRegion(payload, {
      name: 'Austria',
      level: 'country',
      managers: [outsider.id],
    })

    restAsGermanOnly = await createRestClientAs(env, germanOnlyManager)
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('what the batch holds', () => {
    it('stages the parsed rows against the target, owned by the caller', async () => {
      const { status, body } = await upload(uploader, validBody())

      expect(status).toBe(200)
      expect(body).toMatchObject({ rows: 1 })

      const batch = await readBatch(body.id as number)
      expect(batch.status).toBe('uploaded')
      expect(batch.targetRegion).toBe(germany.id)
      expect(batch.uploader).toBe(uploader.id)
      expect(batch.defaultLanguages).toEqual(['de'])
      expect(batch.rows).toHaveLength(1)
      expect(batch.rows?.[0]).toMatchObject({ line: 2, errors: [] })
    })

    it('owns the batch by the caller, whatever the body names', async () => {
      // `batchUploaderAccess` is computed from this column, so a body that could
      // name it would hand a stranger a CSV of contact details. What stops it is
      // the schema being closed — this case goes red the moment that widens.
      const { body } = await upload(uploader, {
        ...validBody(),
        uploader: outsider.id,
      } as UploadBody)

      expect((await readBatch(body.id as number)).uploader).toBe(uploader.id)
    })

    it('loads the target before it parses a row', async () => {
      const unnamed = await testData.createRegion(payload, {
        name: 'Deutschland',
        level: 'country',
        managers: [uploader.id],
      })
      const { status, body } = await upload(uploader, validBody({ targetRegion: unnamed.id }))

      // A country whose name is not the ISO one resolves to no country code. The
      // CSV here is valid, so a refusal can only have come from the target.
      expect(status).toBe(422)
      expect(body.errors).toBeDefined()
    })
  })

  describe('who may upload', () => {
    it('admits an admin', async () => {
      const { status } = await upload(admin, validBody())
      expect(status).toBe(200)
    })

    it('refuses a manager who does not manage the target', async () => {
      const { status, body } = await upload(outsider, validBody())

      expect(status).toBe(403)
      expect(body.errors).toMatchObject([{ message: 'You do not manage that region.' }])
    })

    // ⚠ **Both assert the guard's own message, not just the 403.** The role
    // check below refuses these two callers as well — an inactive manager
    // through `bypassPermissions`, a client because its role grants no
    // `events: create` — so a bare status assertion passes with
    // `requireActiveManager` deleted, and says nothing about which gate answered.
    it('refuses an inactive manager at the guard', async () => {
      const { status, body } = await upload(inactiveManager, validBody())

      expect(status).toBe(403)
      expect(body.errors).toMatchObject([
        { message: 'You are not allowed to perform this action.' },
      ])
    })

    it('refuses an API client at the guard', async () => {
      const { status, body } = await upload(client, validBody())

      expect(status).toBe(403)
      expect(body.errors).toMatchObject([
        { message: 'You are not allowed to perform this action.' },
      ])
    })
  })

  /**
   * One manager, three requests — so what each case varies is the locale the
   * request names and nothing else.
   */
  describe('the locale the grant is read for', () => {
    const post = (query = '') =>
      restAsGermanOnly(`/api/event-imports/upload${query}`, {
        method: 'POST',
        json: validBody(),
      })

    it('admits the locale the manager holds the role in', async () => {
      expect((await post('?locale=de')).status).toBe(200)
    })

    it('refuses a locale they hold no role in', async () => {
      const { status, body } = await post('?locale=en')

      expect(status).toBe(403)
      expect(body.errors).toMatchObject([
        { message: 'You are not allowed to create classes in this language.' },
      ])
    })

    it('refuses a request naming no locale, because it resolves to the default', async () => {
      expect((await post()).status).toBe(403)
    })
  })

  describe('what it refuses', () => {
    it('refuses a venue target, which has nothing to propose beneath it', async () => {
      const { status, body } = await upload(uploader, validBody({ targetRegion: berlinHall.id }))

      expect(status).toBe(422)
      expect(body.errors).toMatchObject([
        { message: "A venue cannot hold imported classes' regions. Target a country, state or city." },
      ])
    })

    it('accepts the row cap and refuses one row past it', async () => {
      const atCap = await upload(uploader, validBody({ csv: csvWithRows(MAX_IMPORT_ROWS) }))
      expect(atCap.status).toBe(200)
      expect(atCap.body.rows).toBe(MAX_IMPORT_ROWS)

      const overCap = await upload(uploader, validBody({ csv: csvWithRows(MAX_IMPORT_ROWS + 1) }))
      expect(overCap.status).toBe(422)
      expect(overCap.body.errors).toMatchObject([
        { message: expect.stringContaining(`the limit is ${MAX_IMPORT_ROWS}`) },
      ])
    })

    it('refuses a file the parser cannot read', async () => {
      const { status, body } = await upload(uploader, validBody({ csv: 'titel\nx' }))

      expect(status).toBe(422)
      expect(body.errors).toMatchObject([
        { message: expect.stringContaining('Unrecognised column: titel') },
      ])
    })

    it('refuses a default language that is not a language code', async () => {
      const { status, body } = await upload(uploader, validBody({ defaultLanguages: ['de', 'zz'] }))

      expect(status).toBe(400)
      expect(body.errors).toMatchObject([{ message: 'Not a language code: zz.' }])
    })

    it('refuses an empty default language list', async () => {
      const { status } = await upload(uploader, validBody({ defaultLanguages: [] }))
      expect(status).toBe(400)
    })

    it('refuses a bodiless post', async () => {
      const { status } = await upload(uploader, null)
      expect(status).toBe(400)
    })

    it('creates nothing for any refusal', async () => {
      const before = await payload.count({ collection: 'event-imports', overrideAccess: true })
      await upload(outsider, validBody())
      await upload(uploader, validBody({ targetRegion: berlinHall.id }))
      await upload(uploader, validBody({ csv: 'titel\nx' }))
      const after = await payload.count({ collection: 'event-imports', overrideAccess: true })

      expect(after.totalDocs).toBe(before.totalDocs)
    })
  })

  describe('template endpoint', () => {
    const fetchTemplate = (user: Manager | Client): Promise<Response> =>
      Promise.resolve(eventImportTemplate.handler(reqAs(user, null)) as Response)

    it('serves the generated template as a download', async () => {
      const response = await fetchTemplate(uploader)

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8')
      expect(response.headers.get('content-disposition')).toBe(
        `attachment; filename="${IMPORT_TEMPLATE_FILENAME}"`,
      )

      // The header the parser demands, served from the same column spec.
      const body = await response.text()
      expect(body.split('\n')[0]).toContain('title,eventType,country')
    })

    it('refuses an API client', async () => {
      expect((await fetchTemplate(client)).status).toBe(403)
    })
  })
})
