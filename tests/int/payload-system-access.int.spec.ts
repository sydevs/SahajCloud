/**
 * Access to the entities Payload creates itself — `payload-jobs`,
 * `payload-jobs-stats`, `payload-locked-documents`, `payload-preferences`,
 * `payload-migrations`, `payload-kv` — and to `jobs.access`.
 *
 * `accessPlugin` never sees them: `sanitizeConfig` appends them after every
 * plugin has run, most with `Boolean(user)` access, which a published client's
 * API key satisfies. `restrictPayloadSystemEntities` sets their access on the
 * sanitized config instead (`src/plugins/access/systemEntities.ts`).
 *
 * ⚠ The write cases assert by **reading the row back** at `overrideAccess:
 * true`, not by the status alone. Before the fix, a client PATCH of another
 * user's preference row answered 200 *and* reassigned the row to the client —
 * only the row says which of the two a refusal prevented.
 */
import type { RestClient } from '../utils/restRequest'
import type { Payload, PayloadRequest } from 'payload'

import { handleEndpoints } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Client, Form, Manager, Narrator, PayloadLockedDocument } from '@/payload-types'

import { createRestClient, createRestClientAs } from '../utils/restRequest'
import { testData } from '../utils/testData'
import { createClientAuthenticatedRequest, createTestEnvironment } from '../utils/testHelpers'

const { verifyMock } = vi.hoisted(() => ({ verifyMock: vi.fn() }))

vi.mock('@/lib/turnstile/verifyTurnstile', () => ({
  verifyTurnstileToken: verifyMock,
}))

const APP_API_KEY = 'app-client-key-for-payload-system-access-spec'
const ATLAS_API_KEY = 'atlas-client-key-for-payload-system-access-spec'
const SYSTEM_SLUG_PREFIX = 'payload-'
/** A queue no autoRun cron or test ever fills, so a run that got through would touch only this spec's job. */
const SPEC_QUEUE = 'payload-system-access-spec'

describe('Payload system entities access', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let config: Awaited<ReturnType<typeof createTestEnvironment>>['config']
  let adminManager: Manager
  let editor: Manager
  let appClient: Client
  let contactForm: Form
  let narrator: Narrator
  let adminRest: RestClient
  let editorRest: RestClient

  /** A real REST call, authenticated by a published client's API key. */
  async function clientRest(
    path: string,
    init: {
      method?: string
      json?: unknown
      apiKey?: string
      headers?: Record<string, string>
    } = {},
  ): Promise<{ status: number; body: unknown }> {
    const headers: Record<string, string> = {
      Authorization: `clients API-Key ${init.apiKey ?? APP_API_KEY}`,
      ...init.headers,
    }
    if (init.json !== undefined) headers['Content-Type'] = 'application/json'
    const response = await handleEndpoints({
      config,
      request: new Request(`http://localhost:3000${path}`, {
        method: init.method ?? 'GET',
        headers,
        body: init.json === undefined ? undefined : JSON.stringify(init.json),
      }),
    })
    return { status: response.status, body: await response.json() }
  }

  const clientReq = (): PayloadRequest =>
    ({
      ...createClientAuthenticatedRequest(appClient.id, APP_API_KEY, ['wemeditate-app-client']),
      payload,
      context: {},
    }) as unknown as PayloadRequest

  const queueSpecJob = (submissionId: number) =>
    payload.jobs.queue({ task: 'screenSubmission', input: { submissionId }, queue: SPEC_QUEUE })

  const lockNarrator = (manager: Manager): Promise<PayloadLockedDocument> =>
    payload.create({
      collection: 'payload-locked-documents',
      data: {
        document: { relationTo: 'narrators', value: narrator.id },
        user: { relationTo: 'managers', value: manager.id },
      },
    })

  /** Written the way the admin panel writes it, so the `user` hook stamps the owner. */
  async function adminPreference(key: string, value: Record<string, unknown>) {
    await adminRest(`/api/payload-preferences/${key}`, { method: 'POST', json: { value } })
    const { docs } = await payload.find({
      collection: 'payload-preferences',
      where: { key: { equals: key } },
      depth: 0,
    })
    return docs[0]
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    config = env.config
    adminManager = env.adminUser

    editor = await testData.createManager(payload, {
      name: 'Meditations Editor',
      roles: ['meditations-editor'],
    })
    appClient = await testData.createClient(payload, adminManager.id, {
      name: 'We Meditate App',
      roles: ['wemeditate-app-client'],
      apiKey: APP_API_KEY,
    })
    // `wemeditate-app-client` holds no `user-submissions` create grant, so the
    // intake case below needs a client whose role actually reaches the collection.
    await testData.createClient(payload, adminManager.id, {
      name: 'Sahaj Atlas Widget',
      roles: ['sahaj-atlas-client'],
      apiKey: ATLAS_API_KEY,
    })
    narrator = await testData.createNarrator(payload, { name: 'Lockable Narrator' })

    verifyMock.mockResolvedValue({ success: true })
    contactForm = (await payload.create({
      collection: 'forms',
      data: {
        title: 'Report an issue',
        actionType: 'contact',
        recipient: adminManager.id,
        confirmationType: 'redirect',
        redirect: { url: '/thanks' },
        fields: [
          { blockType: 'email', name: 'email', label: 'Email' },
          { blockType: 'textarea', name: 'message', label: 'Message' },
        ],
      } as never,
    })) as Form

    adminRest = await createRestClient({ payload, config, adminUser: adminManager })
    editorRest = await createRestClientAs({ payload, config }, editor)
  })

  afterAll(async () => {
    await cleanup?.()
  })

  describe('every payload-* entity refuses a client', () => {
    it('denies every collection operation, including on entities added after this spec', async () => {
      const systemCollections = payload.config.collections.filter((c) =>
        c.slug.startsWith(SYSTEM_SLUG_PREFIX),
      )
      expect(systemCollections.map((c) => c.slug)).toEqual(
        expect.arrayContaining([
          'payload-jobs',
          'payload-locked-documents',
          'payload-preferences',
          'payload-migrations',
          'payload-kv',
        ]),
      )

      const operations = ['create', 'read', 'update', 'delete', 'readVersions', 'unlock'] as const
      for (const collection of systemCollections) {
        for (const operation of operations) {
          const result = await collection.access[operation]?.({ req: clientReq() })
          expect(result, `${collection.slug}.${operation}`).toBeFalsy()
        }
      }
    })

    it('denies every global operation', async () => {
      const systemGlobals = payload.config.globals.filter((g) =>
        g.slug.startsWith(SYSTEM_SLUG_PREFIX),
      )
      // Present because tasks declare a `schedule`.
      expect(systemGlobals.map((g) => g.slug)).toContain('payload-jobs-stats')

      for (const global of systemGlobals) {
        for (const operation of ['read', 'update', 'readVersions'] as const) {
          const result = await global.access[operation]?.({ req: clientReq() })
          expect(result, `${global.slug}.${operation}`).toBeFalsy()
        }
      }
    })
  })

  describe('payload-jobs and jobs.access', () => {
    it('refuses a client listing or reading a job', async () => {
      const job = await queueSpecJob(101)

      expect((await clientRest('/api/payload-jobs')).status).toBe(403)
      expect((await clientRest(`/api/payload-jobs/${job.id}`)).status).toBe(403)
    })

    it('refuses a client queuing a job with its own input', async () => {
      const before = await payload.count({ collection: 'payload-jobs' })

      const res = await clientRest('/api/payload-jobs', {
        method: 'POST',
        json: { taskSlug: 'screenSubmission', input: { submissionId: 1 }, queue: SPEC_QUEUE },
      })

      expect(res.status).toBe(403)
      expect((await payload.count({ collection: 'payload-jobs' })).totalDocs).toBe(before.totalDocs)
    })

    it('refuses a client rewriting or deleting a queued job', async () => {
      const job = await queueSpecJob(202)

      const patch = await clientRest(`/api/payload-jobs/${job.id}`, {
        method: 'PATCH',
        json: { input: { submissionId: 999 } },
      })
      const del = await clientRest(`/api/payload-jobs/${job.id}`, { method: 'DELETE' })

      expect(patch.status).toBe(403)
      expect(del.status).toBe(403)
      const after = await payload.findByID({ collection: 'payload-jobs', id: job.id })
      expect(after.input).toEqual({ submissionId: 202 })
    })

    it('refuses a client running the queue or handling schedules, and runs nothing', async () => {
      const job = await queueSpecJob(303)

      const run = await clientRest(`/api/payload-jobs/run?queue=${SPEC_QUEUE}`)
      const schedules = await clientRest(`/api/payload-jobs/handle-schedules?queue=${SPEC_QUEUE}`)

      expect(run.status).toBe(401)
      expect(schedules.status).toBe(401)
      const after = await payload.findByID({ collection: 'payload-jobs', id: job.id })
      expect(after.totalTried ?? 0).toBe(0)
    })

    it('refuses a client at the local API when access is enforced', async () => {
      await expect(
        payload.jobs.queue({
          task: 'screenSubmission',
          input: { submissionId: 1 },
          queue: SPEC_QUEUE,
          overrideAccess: false,
          req: clientReq(),
        }),
      ).rejects.toThrow()
      await expect(
        payload.jobs.run({ queue: SPEC_QUEUE, overrideAccess: false, req: clientReq() }),
      ).rejects.toThrow()
      await expect(
        payload.jobs.cancel({
          where: { queue: { equals: SPEC_QUEUE } },
          overrideAccess: false,
          req: clientReq(),
        }),
      ).rejects.toThrow()
    })

    /**
     * ⚠ The one production path that queues a job carries a **client** `req`:
     * `enqueueSubmissionScreening` forwards it with no `overrideAccess`, and
     * Payload defaults that to `true`, so admin-only `jobs.access.queue` is
     * never consulted. That default is the whole reason the public intake
     * still works, and it is a Payload internal — pin it here, or a version
     * that flips it takes down every Atlas and app form submission.
     */
    it('still queues screening for a client submission over REST', async () => {
      const before = await payload.count({ collection: 'payload-jobs' })

      const res = await clientRest('/api/user-submissions', {
        method: 'POST',
        apiKey: ATLAS_API_KEY,
        headers: { 'x-turnstile-token': 'tok-valid' },
        json: {
          type: 'contact',
          form: contactForm.id,
          senderEmail: 'reporter@example.com',
          submissionData: [{ field: 'message', value: 'The venue closed last month.' }],
        },
      })

      expect(res.status).toBe(201)
      const submissionId = Number((res.body as { doc: { id: number | string } }).doc.id)
      const queued = await payload.find({
        collection: 'payload-jobs',
        where: { taskSlug: { equals: 'screenSubmission' } },
        depth: 0,
        overrideAccess: true,
      })
      expect((await payload.count({ collection: 'payload-jobs' })).totalDocs).toBe(
        before.totalDocs + 1,
      )
      expect(
        queued.docs.map((job) => (job.input as { submissionId: number }).submissionId),
      ).toContain(submissionId)
    })

    it('refuses a non-admin manager and still serves an admin', async () => {
      await queueSpecJob(404)

      expect((await editorRest('/api/payload-jobs')).status).toBe(403)
      expect((await editorRest(`/api/payload-jobs/run?queue=${SPEC_QUEUE}`)).status).toBe(401)

      const adminList = await adminRest(`/api/payload-jobs?where[queue][equals]=${SPEC_QUEUE}`)
      expect(adminList.status).toBe(200)
      expect(adminList.body.totalDocs).toBeGreaterThan(0)
    })
  })

  describe('payload-jobs-stats', () => {
    it('refuses a client overwriting the scheduling stats', async () => {
      const before = await payload.findGlobal({ slug: 'payload-jobs-stats' })

      const res = await clientRest('/api/globals/payload-jobs-stats', {
        method: 'POST',
        json: { stats: { scheduledRuns: { queues: {} } } },
      })

      expect(res.status).toBe(403)
      expect((await payload.findGlobal({ slug: 'payload-jobs-stats' })).stats).toEqual(before.stats)
    })
  })

  describe('payload-locked-documents', () => {
    it('refuses a client creating, taking over or releasing a lock', async () => {
      const lock = await lockNarrator(adminManager)
      const before = await payload.count({ collection: 'payload-locked-documents' })

      const create = await clientRest('/api/payload-locked-documents', {
        method: 'POST',
        json: {
          document: { relationTo: 'narrators', value: narrator.id },
          user: { relationTo: 'managers', value: adminManager.id },
        },
      })
      const takeover = await clientRest(`/api/payload-locked-documents/${lock.id}`, {
        method: 'PATCH',
        json: { globalSlug: 'taken-over' },
      })
      const release = await clientRest(`/api/payload-locked-documents/${lock.id}`, {
        method: 'DELETE',
      })

      expect([create.status, takeover.status, release.status]).toEqual([403, 403, 403])
      expect((await payload.count({ collection: 'payload-locked-documents' })).totalDocs).toBe(
        before.totalDocs,
      )
      const after = await payload.findByID({ collection: 'payload-locked-documents', id: lock.id })
      expect(after.globalSlug ?? null).toBeNull()

      await payload.delete({ collection: 'payload-locked-documents', id: lock.id })
    })

    it('still lets a non-admin manager lock, take over and release, as the edit view does', async () => {
      const othersLock = await lockNarrator(adminManager)

      const create = await editorRest('/api/payload-locked-documents', {
        method: 'POST',
        json: {
          document: { relationTo: 'narrators', value: narrator.id },
          user: { relationTo: 'managers', value: editor.id },
        },
      })
      const takeover = await editorRest(`/api/payload-locked-documents/${othersLock.id}`, {
        method: 'PATCH',
        json: { user: { relationTo: 'managers', value: editor.id } },
      })
      const ownLockId = (create.body.doc as { id: number }).id
      const release = await editorRest(`/api/payload-locked-documents/${ownLockId}`, {
        method: 'DELETE',
      })

      expect([create.status, takeover.status, release.status]).toEqual([201, 200, 200])

      await payload.delete({ collection: 'payload-locked-documents', id: othersLock.id })
    })
  })

  describe('payload-preferences', () => {
    it("refuses a client rewriting another user's row, which used to reassign it", async () => {
      const pref = await adminPreference('spec-admin-columns', { columns: ['title'] })

      const res = await clientRest(`/api/payload-preferences/${pref.id}`, {
        method: 'PATCH',
        json: { value: { columns: [] } },
      })

      expect(res.status).toBe(403)
      const after = await payload.findByID({
        collection: 'payload-preferences',
        id: pref.id,
        depth: 0,
      })
      expect(after.user).toEqual({ relationTo: 'managers', value: adminManager.id })
      expect(after.value).toEqual({ columns: ['title'] })
    })

    it('refuses a client storing rows, through the collection and the /:key endpoint', async () => {
      const create = await clientRest('/api/payload-preferences', {
        method: 'POST',
        json: { key: 'spec-client-create', value: { x: 1 } },
      })
      const byKey = await clientRest('/api/payload-preferences/spec-client-key', {
        method: 'POST',
        json: { value: { x: 1 } },
      })

      expect([create.status, byKey.status]).toEqual([403, 403])
      const clientRows = await payload.count({
        collection: 'payload-preferences',
        where: { 'user.relationTo': { equals: 'clients' } },
      })
      expect(clientRows.totalDocs).toBe(0)
    })

    it("keeps a manager's own preferences working and another manager's row out of reach", async () => {
      const others = await adminPreference('spec-admin-nav', { open: true })

      const write = await editorRest('/api/payload-preferences/spec-editor-nav', {
        method: 'POST',
        json: { value: { open: false } },
      })
      const read = await editorRest('/api/payload-preferences/spec-editor-nav')
      const hijack = await editorRest(`/api/payload-preferences/${others.id}`, {
        method: 'PATCH',
        json: { value: { open: false } },
      })

      expect(write.status).toBe(200)
      expect(read.body.value).toEqual({ open: false })
      expect(hijack.status).toBe(403)
      const after = await payload.findByID({
        collection: 'payload-preferences',
        id: others.id,
        depth: 0,
      })
      expect(after.user).toEqual({ relationTo: 'managers', value: adminManager.id })
      expect(after.value).toEqual({ open: true })
    })
  })
})
