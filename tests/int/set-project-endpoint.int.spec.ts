import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { setProject } from '@/collections/Managers/endpoints/setProject'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

type CallerUser = { id: number | string; collection: string; type?: string } | null

async function callSetProject(
  payload: Payload,
  body: unknown,
  user: CallerUser,
): Promise<{ status: number; body: { ok?: boolean; currentProject?: unknown; errors?: unknown } }> {
  const req = {
    payload,
    user,
    locale: 'en',
    headers: new Headers({ 'content-type': 'application/json' }),
    context: {},
    json: async () => body,
  } as unknown as PayloadRequest

  const response = (await setProject.handler(req)) as Response
  return { status: response.status, body: await response.json() }
}

const asManager = (m: { id: number | string }): CallerUser => ({
  id: m.id,
  collection: 'managers',
  type: 'manager',
})

describe('setProject endpoint (POST /api/managers/set-project)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
  })

  afterAll(async () => {
    await cleanup()
  })

  it("persists currentProject on the caller's own document", async () => {
    const mgr = await testData.createManager(payload, { name: 'Switcher' })
    const res = await callSetProject(payload, { currentProject: 'wemeditate-web' }, asManager(mgr))

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, currentProject: 'wemeditate-web' })

    const reread = await payload.findByID({ collection: 'managers', id: mgr.id })
    expect(reread.currentProject).toBe('wemeditate-web')
  })

  it('accepts null (the admin "All Content" view)', async () => {
    const mgr = await testData.createManager(payload, {
      name: 'Admin View',
      currentProject: 'sahaj-atlas',
    })
    const res = await callSetProject(payload, { currentProject: null }, asManager(mgr))

    expect(res.status).toBe(200)
    expect(res.body.currentProject).toBeNull()

    const reread = await payload.findByID({ collection: 'managers', id: mgr.id })
    expect(reread.currentProject ?? null).toBeNull()
  })

  it('writes ONLY currentProject — roles, type, and name are untouched', async () => {
    const mgr = await testData.createManager(payload, {
      name: 'Editor',
      type: 'manager',
      roles: ['meditations-editor'],
    })
    await callSetProject(payload, { currentProject: 'wemeditate-app' }, asManager(mgr))

    const reread = await payload.findByID({ collection: 'managers', id: mgr.id, locale: 'en' })
    expect(reread.currentProject).toBe('wemeditate-app')
    expect(reread.name).toBe('Editor')
    expect(reread.type).toBe('manager')
    expect(reread.roles).toEqual(['meditations-editor'])
  })

  it('is self-scoped — writing as manager A never touches manager B', async () => {
    const a = await testData.createManager(payload, { name: 'A', currentProject: 'wemeditate-web' })
    const b = await testData.createManager(payload, { name: 'B', currentProject: 'sahaj-atlas' })

    await callSetProject(payload, { currentProject: 'wemeditate-app' }, asManager(a))

    const rereadB = await payload.findByID({ collection: 'managers', id: b.id })
    expect(rereadB.currentProject).toBe('sahaj-atlas')
  })

  describe('auth + validation guards', () => {
    it('rejects an unauthenticated caller with 403', async () => {
      const res = await callSetProject(payload, { currentProject: 'wemeditate-web' }, null)
      expect(res.status).toBe(403)
    })

    it('rejects a non-manager (API client) caller with 403', async () => {
      const res = await callSetProject(
        payload,
        { currentProject: 'wemeditate-web' },
        {
          id: 999999,
          collection: 'clients',
        },
      )
      expect(res.status).toBe(403)
    })

    it('rejects an inactive manager with 403 (locked out, matching the access bypass)', async () => {
      const res = await callSetProject(
        payload,
        { currentProject: 'wemeditate-web' },
        {
          id: 888888,
          collection: 'managers',
          type: 'inactive',
        },
      )
      expect(res.status).toBe(403)
    })

    it('rejects an invalid project slug with 400', async () => {
      const mgr = await testData.createManager(payload, { name: 'Bad Input' })
      const res = await callSetProject(payload, { currentProject: 'not-a-project' }, asManager(mgr))
      expect(res.status).toBe(400)
    })

    it('rejects a malformed body (missing currentProject) with 400', async () => {
      const mgr = await testData.createManager(payload, { name: 'Missing Field' })
      const res = await callSetProject(payload, { project: 'wemeditate-web' }, asManager(mgr))
      expect(res.status).toBe(400)
    })
  })
})
