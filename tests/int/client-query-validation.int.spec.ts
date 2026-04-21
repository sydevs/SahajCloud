import type { Payload, PayloadRequest } from 'payload'

import { beforeAll, afterAll, describe, expect, it } from 'vitest'

import type { Client, Narrator } from '@/payload-types'

import { SKIP_CLIENT_QUERY_VALIDATION_KEY } from '@/lib/usage/constants'

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

  const clientReq = (): PayloadRequest =>
    createClientAuthenticatedRequest(
      String(testClient.id),
      testClient.apiKey || 'test-key',
    ) as PayloadRequest

  // Access control is unrelated to this hook; use overrideAccess so tests focus
  // purely on validation behavior, not on whether the test client has narrator
  // read permissions.
  describe('select parameter', () => {
    it('rejects client find without select', async () => {
      await expect(
        payload.find({
          collection: 'narrators',
          req: clientReq(),
          overrideAccess: true,
        }),
      ).rejects.toThrow(/select/)
    })

    it('allows client find with select', async () => {
      const result = await payload.find({
        collection: 'narrators',
        select: { name: true },
        req: clientReq(),
        overrideAccess: true,
      })
      expect(result.docs).toHaveLength(1)
    })

    it('rejects client findByID without select', async () => {
      await expect(
        payload.findByID({
          collection: 'narrators',
          id: narrator.id,
          req: clientReq(),
          overrideAccess: true,
        }),
      ).rejects.toThrow(/select/)
    })

    it('allows client findByID with select', async () => {
      const result = await payload.findByID({
        collection: 'narrators',
        id: narrator.id,
        select: { name: true },
        req: clientReq(),
        overrideAccess: true,
      })
      expect(result.id).toBe(narrator.id)
    })
  })

  describe('populate parameter', () => {
    it('rejects client find with depth > 1 but no populate', async () => {
      await expect(
        payload.find({
          collection: 'narrators',
          select: { name: true },
          depth: 2,
          req: clientReq(),
          overrideAccess: true,
        }),
      ).rejects.toThrow(/populate/)
    })

    it('allows client find with depth > 1 and populate', async () => {
      const result = await payload.find({
        collection: 'narrators',
        select: { name: true },
        depth: 2,
        populate: { narrators: { name: true } },
        req: clientReq(),
        overrideAccess: true,
      })
      expect(result.docs).toHaveLength(1)
    })

    it('allows client find with depth=1 without populate', async () => {
      const result = await payload.find({
        collection: 'narrators',
        select: { name: true },
        depth: 1,
        req: clientReq(),
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
      } as unknown as PayloadRequest

      const result = await payload.find({
        collection: 'narrators',
        req: managerReq,
      })
      expect(result.docs).toHaveLength(1)
    })

    it('skips validation when SKIP_CLIENT_QUERY_VALIDATION_KEY context flag is set', async () => {
      // Trusted internal endpoints set this flag when forwarding client req to
      // payload.find(...) so they don't have to enumerate every field via select.
      const trustedReq = {
        ...clientReq(),
        context: { [SKIP_CLIENT_QUERY_VALIDATION_KEY]: true },
      } as unknown as PayloadRequest

      const result = await payload.find({
        collection: 'narrators',
        req: trustedReq,
        overrideAccess: true,
      })
      expect(result.docs).toHaveLength(1)
    })

    it('does not affect client write operations missing select', async () => {
      // Create a new narrator as the client — should not be blocked by the hook
      // even though no 'select' param is present.
      const result = await payload.create({
        collection: 'narrators',
        data: { name: 'Created By Client', gender: 'female' },
        req: clientReq(),
        overrideAccess: true,
      })
      expect(result.name).toBe('Created By Client')
    })
  })
})
