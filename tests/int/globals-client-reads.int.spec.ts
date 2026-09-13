import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { Client } from '@/payload-types'

import { testData } from 'tests/utils/testData'

import { createTestEnvironment } from '../utils/testHelpers'

/**
 * End-to-end wiring for the usage plugin's four `beforeOperation` gates on the
 * **global** surface (#710). Before it, `GET /api/globals/*` was unmetered,
 * outside origin enforcement, and exempt from the `select` gate — while every
 * atlas widget boot and every WeMeditateWeb request reads a global.
 *
 * ## ⚠ `overrideAccess: false` is what makes these reads realistic
 *
 * It is not a convenience here, the way `overrideAccess: true` is in the
 * collection specs. The adapter (`asGlobalBeforeOperationHook`) uses this flag
 * as its internal-read exemption, so a spec that omitted it would read
 * `overrideAccess: true` — payload's local-API default — and every gate would
 * correctly skip, leaving four vacuous assertions.
 *
 * Payload's REST handler for a global never passes the flag, so a real client
 * read arrives `false`. That is what these reads reproduce. The sibling
 * `describe` at the bottom asserts the other half: an internal read, which
 * arrives `true`, is skipped.
 */
describe('client reads of a global (#710)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let testClient: Client
  let adminUserId: number

  /**
   * A client request, exactly as API-key auth builds one: `req.user` is the
   * client doc.
   *
   * `roles` matters because these reads run under real access control (see the
   * `overrideAccess` note above). A client role grants implicit read only over
   * its own project's globals, so a `wm-*` read needs the web role, not the
   * atlas one.
   */
  function clientReq(
    opts: { allowedDomains?: string | null; origin?: string; roles?: string[] } = {},
  ): PayloadRequest {
    const headers = new Headers()
    if (opts.origin) headers.set('origin', opts.origin)
    headers.set('authorization', `clients API-Key ${testClient.apiKey ?? 'test-key'}`)
    return {
      payload,
      headers,
      routeParams: {},
      context: {},
      user: {
        id: testClient.id,
        collection: 'clients',
        _status: 'published',
        roles: opts.roles ?? ['sahaj-atlas-client'],
        allowedDomains: opts.allowedDomains ?? null,
      },
    } as unknown as PayloadRequest
  }

  /** The client's current daily counter, read straight from the row. */
  async function dailyRequests(): Promise<number> {
    const row = (await payload.findByID({
      collection: 'clients',
      id: testClient.id,
    })) as Client
    return row.usage?.dailyRequests ?? 0
  }

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    adminUserId = testEnv.adminUser.id
    testClient = await testData.createClient(payload, adminUserId, {
      name: 'Globals Cache Test Client',
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('the operation literal a global read reports', () => {
    it("reports `read`, so the two gates keyed on that literal fire", async () => {
      // The one claim #710 could not settle from the checkout. Two of the four
      // hooks return early unless `operation === 'read'`; were a global's
      // literal spelled differently, metering would silently count nothing and
      // the select gate would never refuse anything.
      //
      // Asserted through behaviour rather than by reading payload's types: the
      // select gate below can only refuse this read if it saw `read`.
      await expect(
        payload.findGlobal({
          slug: 'sy-atlas-config',
          req: clientReq(),
          overrideAccess: false,
        }),
      ).rejects.toThrow(/select/)
    })
  })

  describe('the select gate', () => {
    it('refuses a client global read carrying no select', async () => {
      await expect(
        payload.findGlobal({ slug: 'sy-atlas-config', req: clientReq(), overrideAccess: false }),
      ).rejects.toThrow(/select/)
    })

    it('allows a client global read that declares its fields', async () => {
      const result = await payload.findGlobal({
        slug: 'sy-atlas-config',
        select: { availableLocales: true },
        depth: 1,
        req: clientReq(),
        overrideAccess: false,
      })
      expect(result).toBeDefined()
    })
  })

  describe('origin enforcement', () => {
    it('refuses a global read from an origin outside a non-empty allowedDomains', async () => {
      await expect(
        payload.findGlobal({
          slug: 'sy-atlas-config',
          select: { availableLocales: true },
          depth: 1,
          req: clientReq({ allowedDomains: 'allowed.org', origin: 'https://evil.org' }),
          overrideAccess: false,
        }),
      ).rejects.toThrow(/origin is not allowed/)
    })

    it('allows a global read from an origin on the list', async () => {
      const result = await payload.findGlobal({
        slug: 'sy-atlas-config',
        select: { availableLocales: true },
        depth: 1,
        req: clientReq({ allowedDomains: 'allowed.org', origin: 'https://allowed.org' }),
        overrideAccess: false,
      })
      expect(result).toBeDefined()
    })

    it('allows a global read when allowedDomains is empty (the default)', async () => {
      const result = await payload.findGlobal({
        slug: 'sy-atlas-config',
        select: { availableLocales: true },
        depth: 1,
        req: clientReq({ origin: 'https://anywhere.example' }),
        overrideAccess: false,
      })
      expect(result).toBeDefined()
    })
  })

  describe('usage metering', () => {
    it('increments the daily counter exactly once per top-level global read', async () => {
      const before = await dailyRequests()
      await payload.findGlobal({
        slug: 'sy-atlas-config',
        select: { availableLocales: true },
        depth: 1,
        req: clientReq(),
        overrideAccess: false,
      })
      expect(await dailyRequests()).toBe(before + 1)
    })

    it('still increments exactly once when the global populates relationships', async () => {
      // `wm-web-config` relates to `pages`. Those nested reads carry a numeric
      // `currentDepth` and are skipped, so a config read costs one increment,
      // not one per populated document.
      const before = await dailyRequests()
      await payload.findGlobal({
        slug: 'wm-web-config',
        select: { homePage: true, featuredPages: true },
        depth: 2,
        populate: { pages: { title: true } },
        req: clientReq({ roles: ['wemeditate-web-client'] }),
        overrideAccess: false,
      })
      expect(await dailyRequests()).toBe(before + 1)
    })

    it('does not increment when the read is refused', async () => {
      // The select gate runs before usage tracking, so a 400 costs no quota.
      const before = await dailyRequests()
      await expect(
        payload.findGlobal({ slug: 'sy-atlas-config', req: clientReq(), overrideAccess: false }),
      ).rejects.toThrow()
      expect(await dailyRequests()).toBe(before)
    })
  })

  describe('an internal global read is exempt', () => {
    it('is neither metered nor refused for passing no select', async () => {
      // The shape every internal caller uses: `payload.findGlobal({ …, req })`,
      // where `overrideAccess` defaults to true. `clientEnglishFallback`
      // re-reads its own global this way while serving a client read, and
      // `loadAppConfigOnce` reads `wm-app-config` while serving a page.
      //
      // Left ungated, this read would be refused 400 for carrying no select —
      // which for the fallback is caught and logged at debug, silently blanking
      // every untranslated key for every client — and metered a second time.
      const before = await dailyRequests()
      const result = await payload.findGlobal({
        slug: 'sy-atlas-translations',
        depth: 0,
        req: clientReq(),
      })
      expect(result).toBeDefined()
      expect(await dailyRequests()).toBe(before)
    })
  })
})
