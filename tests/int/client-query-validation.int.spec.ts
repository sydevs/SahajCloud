import type { Payload, PayloadRequest } from 'payload'

import { sanitizePopulateParam, sanitizeSelectParam } from 'payload'
import * as qs from 'qs-esm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Client, Narrator } from '@/payload-types'

import { testData } from 'tests/utils/testData'

import { createClientAuthenticatedRequest, createTestEnvironment } from '../utils/testHelpers'

/**
 * Emulate Payload's REST URL → args parse pipeline:
 *   createPayloadRequest → qs.parse(search) → parseParams(query)
 * Same `qs.parse` options as `createPayloadRequest` (depth: 10, arrayLimit: 1000)
 * and same sanitize functions as `parseParams`. Returns the args shape that
 * beforeOperation hooks receive when a real HTTP request hits the REST handler.
 */
function parseRestQuery(url: string): Record<string, unknown> {
  const search = url.split('?')[1] || ''
  const query = qs.parse(search, {
    arrayLimit: 1000,
    depth: 10,
    ignoreQueryPrefix: true,
  }) as Record<string, unknown>
  const args = { ...query }
  if ('select' in args) {
    // sanitizeSelectParam mutates the input; pass through it the same way parseParams does
    args.select = sanitizeSelectParam(args.select as never)
  }
  if ('populate' in args) {
    args.populate = sanitizePopulateParam(args.populate as never)
  }
  if (typeof args.depth === 'string') args.depth = Number(args.depth)
  return args
}

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
        context: { skipClientQueryValidation: true },
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

  // These cases exercise the wire format (URL → qs.parse → sanitize → args) that
  // real REST clients hit, not just the SDK shape that the cases above exercise.
  // They guard against the regression in #199/#294 where the docs assumed
  // comma-separated strings but PayloadCMS REST expects bracket notation.
  describe('REST URL format (via qs.parse + sanitize)', () => {
    const restFind = (url: string) =>
      payload.find({
        collection: 'narrators',
        ...parseRestQuery(url),
        req: clientReq(),
        overrideAccess: true,
      })

    const restFindByID = (url: string) =>
      payload.findByID({
        collection: 'narrators',
        id: narrator.id,
        ...parseRestQuery(url),
        req: clientReq(),
        overrideAccess: true,
      })

    describe('rejects the wrong format documented in #199', () => {
      it('rejects find when select is a comma-separated string', async () => {
        await expect(restFind('/api/narrators?select=name,gender')).rejects.toThrow(/select/)
      })

      it('rejects findByID when select is a comma-separated string', async () => {
        await expect(restFindByID('/api/narrators/1?select=name,gender')).rejects.toThrow(/select/)
      })
    })

    describe('accepts the correct bracket notation', () => {
      it('accepts find with select[field]=true', async () => {
        const result = await restFind('/api/narrators?select[name]=true')
        expect(Array.isArray(result.docs)).toBe(true)
      })

      it('accepts findByID with select[field]=true', async () => {
        const result = await restFindByID('/api/narrators/1?select[name]=true')
        expect(result.id).toBe(narrator.id)
      })

      it('accepts percent-encoded bracket notation (select%5Bname%5D=true)', async () => {
        const result = await restFind('/api/narrators?select%5Bname%5D=true')
        expect(Array.isArray(result.docs)).toBe(true)
      })
    })

    describe('populate at depth > 1', () => {
      it('rejects when depth=2 and populate is missing', async () => {
        await expect(restFind('/api/narrators?select[name]=true&depth=2')).rejects.toThrow(
          /populate/,
        )
      })

      // Reporter's exact failing URL #1 — single-level populate (populate[collection]=true).
      // Locks in the contract: this URL MUST be accepted by the hook. If this test
      // ever fails, it confirms a real server-side bug (rather than a doc/test gap).
      it("accepts reporter's URL #1: populate[collection]=true (single-level)", async () => {
        const result = await restFind(
          '/api/narrators?select[name]=true&depth=2&populate[narrators]=true',
        )
        expect(Array.isArray(result.docs)).toBe(true)
      })

      // Reporter's exact failing URL #2 — two-level populate (populate[coll][field]=true).
      it("accepts reporter's URL #2: populate[collection][field]=true (two-level)", async () => {
        const result = await restFind(
          '/api/narrators?select[name]=true&depth=2&populate[narrators][name]=true',
        )
        expect(Array.isArray(result.docs)).toBe(true)
      })

      it('accepts findByID with depth=2 and nested populate', async () => {
        const result = await restFindByID(
          '/api/narrators/1?select[name]=true&depth=2&populate[narrators][name]=true',
        )
        expect(result.id).toBe(narrator.id)
      })
    })
  })
})
