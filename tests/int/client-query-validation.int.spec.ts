import type { Payload, PayloadRequest } from 'payload'

import { beforeAll, afterAll, describe, expect, it } from 'vitest'

import type { Client, Narrator } from '@/payload-types'

import { testData } from 'tests/utils/testData'

import { createClientAuthenticatedRequest, createTestEnvironment } from '../utils/testHelpers'

describe('Client query parameter validation', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminUserId: number
  let testClient: Client
  let narrator: Narrator

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    adminUserId = testEnv.adminUser.id

    testClient = await testData.createClient(payload, adminUserId)
    narrator = await testData.createNarrator(payload)
  })

  afterAll(async () => {
    await cleanup()
  })

  const clientReq = (url: string): PayloadRequest =>
    createClientAuthenticatedRequest(
      String(testClient.id),
      testClient.apiKey || 'test-key',
      url,
    ) as PayloadRequest

  // Access control is unrelated to this hook; use overrideAccess so tests focus
  // purely on validation behavior, not on whether the test client has narrator
  // read permissions.
  describe('select parameter', () => {
    it('rejects client read without select', async () => {
      await expect(
        payload.find({
          collection: 'narrators',
          req: clientReq('http://localhost/api/narrators'),
          overrideAccess: true,
        }),
      ).rejects.toThrow(/select/)
    })

    it('allows client read with select', async () => {
      const result = await payload.find({
        collection: 'narrators',
        req: clientReq('http://localhost/api/narrators?select=name'),
        overrideAccess: true,
      })
      expect(result.docs).toHaveLength(1)
    })

    it('rejects client findByID without select', async () => {
      await expect(
        payload.findByID({
          collection: 'narrators',
          id: narrator.id,
          req: clientReq(`http://localhost/api/narrators/${narrator.id}`),
          overrideAccess: true,
        }),
      ).rejects.toThrow(/select/)
    })

    it('allows client findByID with select', async () => {
      const result = await payload.findByID({
        collection: 'narrators',
        id: narrator.id,
        req: clientReq(`http://localhost/api/narrators/${narrator.id}?select=name`),
        overrideAccess: true,
      })
      expect(result.id).toBe(narrator.id)
    })
  })

  describe('populate parameter', () => {
    it('rejects client read with depth > 1 but no populate', async () => {
      await expect(
        payload.find({
          collection: 'narrators',
          req: clientReq('http://localhost/api/narrators?select=name&depth=2'),
          overrideAccess: true,
        }),
      ).rejects.toThrow(/populate/)
    })

    it('allows client read with depth > 1 and populate', async () => {
      const result = await payload.find({
        collection: 'narrators',
        req: clientReq(
          'http://localhost/api/narrators?select=name&depth=2&populate=narrator.name',
        ),
        overrideAccess: true,
      })
      expect(result.docs).toHaveLength(1)
    })

    it('allows client read with depth=1 without populate', async () => {
      const result = await payload.find({
        collection: 'narrators',
        req: clientReq('http://localhost/api/narrators?select=name&depth=1'),
        overrideAccess: true,
      })
      expect(result.docs).toHaveLength(1)
    })
  })

  describe('scope — who is affected', () => {
    it('does not affect manager requests without select or populate', async () => {
      const manager = await payload.findByID({
        collection: 'managers',
        id: adminUserId,
      })
      const managerReq = {
        user: manager,
        headers: new Headers(),
        // no url set — the hook should not fire for non-client users anyway
      } as unknown as PayloadRequest

      const result = await payload.find({
        collection: 'narrators',
        req: managerReq,
      })
      expect(result.docs).toHaveLength(1)
    })

    it('does not affect client write operations missing select', async () => {
      // Create a new narrator as the client — should not be blocked by the hook
      // even though no 'select' param is present.
      const result = await payload.create({
        collection: 'narrators',
        data: { name: 'Created By Client', gender: 'female' },
        req: clientReq('http://localhost/api/narrators'),
        overrideAccess: true,
      })
      expect(result.name).toBe('Created By Client')
    })
  })
})
