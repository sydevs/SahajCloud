import type { Payload, PayloadRequest } from 'payload'

import { parseParams } from 'payload'
import * as qs from 'qs-esm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { serverEnv } from '@/lib/env'
import { mintLivePreviewToken } from '@/lib/livePreview/token'
import { resolveLivePreviewHook } from '@/lib/utilities/previewSecret'
import type { Client, Image, Narrator, Page } from '@/payload-types'
import { MAX_CLIENT_LIMIT, MAX_CLIENT_PAGE } from '@/plugins/usage/constants'

import { testData } from 'tests/utils/testData'

import { createClientAuthenticatedRequest, createTestEnvironment } from '../utils/testHelpers'

/**
 * Emulate Payload's REST URL → args parse pipeline:
 *   createPayloadRequest → qs.parse(search) → parseParams(query)
 * Same `qs.parse` options as `createPayloadRequest` (depth: 10, arrayLimit:
 * 1000), then payload's own `parseParams`. Returns the args shape that
 * beforeOperation hooks receive when a real HTTP request hits the REST handler.
 */
function parseRestQuery(url: string): Record<string, unknown> {
  const search = url.split('?')[1] || ''
  const query = qs.parse(search, {
    arrayLimit: 1000,
    depth: 10,
    ignoreQueryPrefix: true,
  }) as Record<string, unknown>
  // `parseParams` is payload's own second stage, exported from `payload`, so
  // this helper reproduces none of it. Reaching for it rather than coercing the
  // params a case happens to use is what keeps the emulation faithful: it
  // parses all 11, so a case added for a new one cannot assert vacuously
  // against an uncoerced string ('2001' is not > 2000, and 'false' is truthy).
  // It mutates its argument, which is why the spread above is not reused.
  return parseParams({ ...query }) as Record<string, unknown>
}

describe('Client query parameter validation', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let adminUserId: number
  let testClient: Client
  let narrator: Narrator
  let pageWithMetaImage: Page
  let metaImage: Image

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    adminUserId = testEnv.adminUser.id

    testClient = await testData.createClient(payload, adminUserId)
    narrator = await testData.createNarrator(payload)
    metaImage = await testData.createMediaImage(payload, { alt: 'Page meta image' })
    pageWithMetaImage = await testData.createPage(payload, {
      meta: { image: metaImage.id },
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  const clientReq = (): PayloadRequest =>
    createClientAuthenticatedRequest(testClient.id, testClient.apiKey || 'test-key', [
      'wemeditate-web-client',
    ]) as PayloadRequest

  // Access control is unrelated to this hook. Use overrideAccess so tests focus
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
        depth: 1,
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
        depth: 1,
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

    it('rejects client find when default depth > 1 but no populate', async () => {
      await expect(
        payload.find({
          collection: 'narrators',
          select: { name: true },
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

    it('allows client find with default depth and populate', async () => {
      const result = await payload.find({
        collection: 'narrators',
        select: { name: true },
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

  // Unbounded, `limit` and `page` each reach Postgres on their own and return
  // 500 rather than 400 (#887). `page` overflows through the
  // `(page - 1) * limit` offset, which is why bounding `limit` alone is not
  // enough, and `page: -1` reaches the same 500 as `OFFSET -20`.
  describe('limit and page bounds', () => {
    const OVERFLOW = 99999999999999999999

    const findAsClient = (extra: Record<string, unknown>) =>
      payload.find({
        collection: 'narrators',
        select: { name: true },
        depth: 1,
        ...extra,
        req: clientReq(),
        overrideAccess: true,
      })

    it.each([
      ['a limit above the cap', { limit: OVERFLOW }, new RegExp(`"limit".*${MAX_CLIENT_LIMIT}`)],
      ['a page above the bound', { page: OVERFLOW }, new RegExp(`"page".*${MAX_CLIENT_PAGE}`)],
      ['a negative page', { page: -1 }, /"page"/],
      ['a negative limit', { limit: -1 }, /"limit"/],
      ['a fractional limit', { limit: 1.5 }, /"limit"/],
    ])('rejects %s', async (_name, args, message) => {
      await expect(findAsClient(args)).rejects.toThrow(message)
    })

    // `limit: 0` and `pagination: false` with no `limit` are payload's two
    // spellings of an unbounded read, and a client now gets neither (#889).
    // The refusal keys on the effective limit payload computes, so the third
    // row below — bounded, and only skipping the `COUNT(*)` — still passes.
    it.each([
      ['limit=0', { limit: 0 }],
      ['pagination=false with no limit', { pagination: false }],
    ])('rejects an unbounded read spelled %s', async (_name, args) => {
      await expect(findAsClient(args)).rejects.toThrow(
        new RegExp(`unbounded.*${MAX_CLIENT_LIMIT}`, 'i'),
      )
    })

    it.each([
      ['a limit at the cap', { limit: MAX_CLIENT_LIMIT }],
      ['pagination=false with a non-zero limit', { pagination: false, limit: 100 }],
    ])('allows %s', async (_name, args) => {
      const result = await findAsClient(args)
      expect(result.docs).toHaveLength(1)
    })

    it('allows a page at the bound', async () => {
      const result = await findAsClient({ page: MAX_CLIENT_PAGE })
      expect(result.page).toBe(MAX_CLIENT_PAGE)
    })

    // An absent `limit` is not an unbounded read: `find.js` defaults it to 10.
    // Asserted on the response rather than on the absence of a throw, because
    // a refusal keyed on `limit == null` alone would also pass that.
    it('leaves an absent limit at payload default of 10', async () => {
      const result = await findAsClient({})
      expect(result.limit).toBe(10)
    })

    // The bound runs ahead of the two bypasses the select gate honours, so a
    // trusted internal read that one day forwards a client's own `limit`
    // cannot reopen the 500.
    it('rejects a limit above the cap on a trusted internal read', async () => {
      const trustedReq = {
        ...clientReq(),
        context: { skipClientQueryValidation: true },
      } as unknown as PayloadRequest

      await expect(
        payload.find({
          collection: 'narrators',
          limit: OVERFLOW,
          req: trustedReq,
          overrideAccess: true,
        }),
      ).rejects.toThrow(/"limit"/)
    })

    // The unbounded refusal is the opposite case, and must be: six internal
    // endpoint reads forward `limit: 0` through `asTrustedReq`, so a refusal
    // ahead of that bypass would 400 every one of them on a client request.
    it.each([
      ['limit=0', { limit: 0 }],
      ['pagination=false with no limit', { pagination: false }],
    ])('allows an unbounded trusted internal read spelled %s', async (_name, args) => {
      const trustedReq = {
        ...clientReq(),
        context: { skipClientQueryValidation: true },
      } as unknown as PayloadRequest

      const result = await payload.find({
        collection: 'narrators',
        ...args,
        req: trustedReq,
        overrideAccess: true,
      })
      expect(result.docs).toHaveLength(1)
    })
  })

  // SahajCloud reads unpaginated on the caller's own `req` in four places, and
  // the gate reads its arguments rather than the URL — so it cannot tell those
  // from a client asking for the whole table. Each forwards `asTrustedReq` as of
  // #889; without that the refusal 400s from inside SahajCloud, on a request the
  // client spelled correctly.
  //
  // Only the region tree's case lives here, because this is the spec that owns
  // the gate's contract and that read is reachable from a plain collection read.
  // The others are covered where their own contract lives, by cases asserting a
  // whole response rather than a status: reverting the wraps reds 23 cases in
  // `atlas-sitemap.int.spec.ts`, 36 in `atlas-seo.int.spec.ts`,
  // `events.int.spec.ts`'s client `findByID` selecting `webPath`, and
  // `app-status-readiness.int.spec.ts`.
  describe("SahajCloud's own unpaginated reads on a client req", () => {
    beforeAll(async () => {
      await testData.createRegion(payload, { name: 'Boundland', slug: 'boundland' })
    })

    // `webPath`/`webUrl`'s afterRead resolves the whole region tree through
    // `loadRegionTree`, which reads every `regions` row with `pagination: false`.
    // The memo is per request, so each page of a client's own paginated walk
    // issues it again.
    it('serves a client read selecting webPath and webUrl on regions', async () => {
      const result = await payload.find({
        collection: 'regions',
        select: { webPath: true, webUrl: true },
        depth: 0,
        limit: 10,
        req: clientReq(),
        overrideAccess: true,
      })
      // Non-vacuous only if the field resolved: a null `webPath` would mean the
      // resolver returned before it read anything.
      expect(result.docs.map((doc) => doc.webPath)).toContain('/boundland')
    })
  })

  describe('scope — who is affected', () => {
    const managerReq = async (): Promise<PayloadRequest> =>
      ({
        user: await payload.findByID({ collection: 'managers', id: adminUserId }),
        headers: new Headers(),
      }) as unknown as PayloadRequest

    it('does not affect manager requests without select or populate', async () => {
      const result = await payload.find({
        collection: 'narrators',
        req: await managerReq(),
      })
      expect(result.docs).toHaveLength(1)
    })

    // Above the client cap, below what the driver refuses: the gate's scope is
    // the decision under test, not whether a manager can still overflow.
    it('does not bound a manager request above the client cap', async () => {
      const result = await payload.find({
        collection: 'narrators',
        limit: MAX_CLIENT_LIMIT + 1,
        req: await managerReq(),
      })
      expect(result.docs).toHaveLength(1)
    })

    it('skips validation when SKIP_CLIENT_QUERY_VALIDATION_KEY context flag is set', async () => {
      // Trusted internal endpoints set this flag when forwarding client req to
      // payload.find(...) so they do not have to enumerate every field via select.
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

    it('skips validation for Payload internal relationship population reads', async () => {
      const result = await payload.find({
        collection: 'narrators',
        currentDepth: 2,
        depth: 1,
        req: clientReq(),
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

  // A live-preview read renders the whole document, so the select/populate
  // gate is skipped. Without the bypass the admin panel 400s because it does
  // not enumerate select — the breakage #294 introduced.
  //
  // ⚠ These reads call `resolveLivePreviewHook` explicitly. Payload runs it as
  // the first `beforeOperation` hook in a real request; a spec that only set
  // the header would leave the verdict unstamped and the bypass inert.
  describe('live preview bypass', () => {
    const previewClientReq = async (token?: string): Promise<PayloadRequest> => {
      const req = clientReq()
      const minted =
        token ??
        (await mintLivePreviewToken(serverEnv.LIVE_PREVIEW_SIGNING_KEY)) ??
        'no-key-configured'
      req.headers.set('x-sahajcloud-preview-secret', minted)
      await resolveLivePreviewHook({ req })
      return req
    }

    it('allows client find without select when a valid preview token is present', async () => {
      const result = await payload.find({
        collection: 'narrators',
        req: await previewClientReq(),
        overrideAccess: true,
      })
      expect(result.docs.length).toBeGreaterThan(0)
    })

    // The unbounded refusal sits after this bypass, where the range bounds sit
    // ahead of it. A preview renders a whole document, so it is trusted with
    // its own shape — and nothing else pins which side of the bypass the
    // refusal landed on.
    it('allows an unbounded read when a valid preview token is present', async () => {
      const result = await payload.find({
        collection: 'narrators',
        pagination: false,
        req: await previewClientReq(),
        overrideAccess: true,
      })
      expect(result.docs.length).toBeGreaterThan(0)
    })

    it('allows client findByID at depth > 1 without select or populate when a valid preview token is present', async () => {
      const result = await payload.findByID({
        collection: 'narrators',
        id: narrator.id,
        depth: 2,
        req: await previewClientReq(),
        overrideAccess: true,
      })
      expect(result.id).toBe(narrator.id)
    })

    it('still rejects when the preview token is not one this service issued', async () => {
      const req = clientReq()
      req.headers.set('x-sahajcloud-preview-secret', 'not-a-real-token')
      await expect(
        payload.find({
          collection: 'narrators',
          req,
          overrideAccess: true,
        }),
      ).rejects.toThrow(/select/)
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

    const restFindPageByID = (url: string) =>
      payload.findByID({
        collection: 'pages',
        id: pageWithMetaImage.id,
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

    it('rejects a limit above the cap', async () => {
      // The coercion, asserted on its own: a case reading `limit` as the
      // string '2001' would pass without ever exceeding the cap.
      expect(parseRestQuery('?limit=2001').limit).toBe(2001)
      await expect(restFind('/api/narrators?select[name]=true&depth=1&limit=2001')).rejects.toThrow(
        /"limit"/,
      )
    })

    it('rejects an unbounded read over the wire', async () => {
      // The coercion, asserted on its own: the string 'false' is truthy, so a
      // case reading it unparsed would never reach the refusal.
      expect(parseRestQuery('?pagination=false').pagination).toBe(false)
      await expect(
        restFind('/api/narrators?select[name]=true&depth=1&pagination=false'),
      ).rejects.toThrow(/unbounded/i)
      await expect(restFind('/api/narrators?select[name]=true&depth=1&limit=0')).rejects.toThrow(
        /unbounded/i,
      )
    })

    describe('accepts the correct bracket notation', () => {
      it('accepts find with select[field]=true', async () => {
        const result = await restFind('/api/narrators?select[name]=true&depth=1')
        expect(Array.isArray(result.docs)).toBe(true)
      })

      it('accepts findByID with select[field]=true', async () => {
        const result = await restFindByID('/api/narrators/1?select[name]=true&depth=1')
        expect(result.id).toBe(narrator.id)
      })

      it('accepts percent-encoded bracket notation (select%5Bname%5D=true)', async () => {
        const result = await restFind('/api/narrators?select%5Bname%5D=true&depth=1')
        expect(Array.isArray(result.docs)).toBe(true)
      })

      it('accepts nested select for relationship fields that Payload populates internally', async () => {
        const result = await restFindPageByID('/api/pages/1?select[meta][image]=true&depth=1')
        expect(result).toBeDefined()
      })
    })

    describe('populate at depth > 1', () => {
      it('rejects when depth is omitted and the server default requires populate', async () => {
        await expect(restFind('/api/narrators?select[name]=true')).rejects.toThrow(/populate/)
      })

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
