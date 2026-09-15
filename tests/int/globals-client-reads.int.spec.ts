import type { Payload, PayloadRequest } from 'payload'

import { handleEndpoints } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'


import { serverEnv } from '@/lib/env'
import { mintLivePreviewToken } from '@/lib/livePreview/token'
import { PREVIEW_SECRET_HEADER, resolveLivePreviewHook } from '@/lib/utilities/previewSecret'
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
 * collection specs. The global wrapper (`onlyOnCallerAuthority`) uses this flag
 * as its internal-read exemption, so a spec that omitted it would read
 * `overrideAccess: true` — payload's local-API default — and every gate would
 * correctly skip, leaving four vacuous assertions.
 *
 * Payload's REST handler for a global never passes the flag, so a real client
 * read arrives `false`. That is what these reads reproduce. The sibling
 * `describe` at the bottom asserts the other half: an internal read, which
 * arrives `true`, is skipped.
 *
 * ⚠ **Reproducing a value is not pinning it.** Every case below supplies
 * `overrideAccess` itself, so together they prove the adapter and say nothing
 * about what payload hands it on a real request. If a REST global read ever
 * arrives with the flag `undefined` — a payload bump, a handler rewrite — all
 * four gates no-op and #710 ships inert with each of those cases still green.
 * `the REST default` at the bottom is what closes that: it drives
 * `handleEndpoints`, payload's own REST entry point, and supplies nothing.
 */
/** The plaintext API key `restGet` authenticates with. See the fixture below. */
const REST_API_KEY = 'globals-client-reads-spec-key'

describe('client reads of a global (#710)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let config: Awaited<ReturnType<typeof createTestEnvironment>>['config']
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

  /**
   * A real REST global read, authenticated with the test client's own API key.
   *
   * `handleEndpoints` is payload's public REST entry point — the same function
   * `@payloadcms/next`'s `REST_GET` calls (see `tests/utils/restRequest.ts`).
   * Nothing here passes `overrideAccess`: what the hooks see is whatever
   * payload's own `findOne` operation defaults it to, which is the whole point.
   */
  async function restGet(path: string): Promise<{ status: number; raw: string }> {
    const response = await handleEndpoints({
      config,
      request: new Request(`http://localhost:3000${path}`, {
        headers: { Authorization: `clients API-Key ${REST_API_KEY}` },
      }),
    })
    return { status: response.status, raw: await response.text() }
  }

  beforeAll(async () => {
    const testEnv = await createTestEnvironment()
    payload = testEnv.payload
    cleanup = testEnv.cleanup
    config = testEnv.config
    adminUserId = testEnv.adminUser.id
    testClient = await testData.createClient(payload, adminUserId, {
      name: 'Globals Cache Test Client',
      roles: ['sahaj-atlas-client'],
      // Set explicitly because payload returns `apiKey: null` from a create —
      // the column is encrypted — and `restGet` needs the plaintext key to
      // authenticate. `roles` is what the access layer reads to allow the
      // `sy-atlas-*` reads below.
      apiKey: REST_API_KEY,
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('the select gate', () => {
    it('refuses a client global read carrying no select', async () => {
      // This also settles the one claim #710 could not settle from the
      // checkout: a global read reports `operation: 'read'`. Two of the four
      // hooks return early unless it does, so this refusal is only reachable
      // if the gate saw that literal — behaviour, rather than a reading of
      // payload's types. Were it spelled differently, metering would silently
      // count nothing and this read would succeed.
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

  /**
   * The wiring, not the adapter. Every other case in this file hands the hooks
   * `overrideAccess: false`; these two hand them nothing and let payload's REST
   * handler supply it.
   *
   * That makes this the one place the four gates can be observed reaching a
   * real client request. `onlyOnCallerAuthority` returns early unless the
   * flag is exactly `false`, so a default of `true` or `undefined` skips all
   * four — and the refusal below becomes a 200. No assertion elsewhere can see
   * that, which is how #710 could otherwise ship inert with a green suite.
   */
  /**
   * The published-only gate, on the **global** surface.
   *
   * `createAccessConfig` constrains a client read of a draft-enabled entity to
   * `{ _status: { equals: 'published' } }` unless the request carries a valid
   * preview secret. On a collection that clause fires. On a global it never
   * has: `collectionHasDrafts` resolves the slug through
   * `req.payload.collections[...]`, and a global is not in that map, so it
   * answers `false` and the clause is skipped entirely.
   *
   * The three translations globals all declare `versions.drafts`, so an
   * ordinary client key plus `?draft=true` reads unpublished copy.
   *
   * ⚠ #777 raised the stakes: `/api/globals/<slug>` is now edge-cacheable, and
   * `matchCacheableRead` keys on the pathname while the middleware gates
   * `no-store` on the preview-secret *header*. So this read is not merely
   * leaked, it is storable — `public, s-maxage=600` against a shared API key.
   */
  describe('the published-only gate', () => {
    const PUBLISHED = 'Published countries title'
    const UNPUBLISHED = 'Unpublished draft countries title'

    beforeAll(async () => {
      await payload.updateGlobal({
        slug: 'sy-atlas-translations',
        locale: 'en',
        data: { _status: 'published', countries: { title: PUBLISHED } } as never,
        overrideAccess: true,
      })
      // Saved, never published. `draft: true` keeps it off the published row.
      await payload.updateGlobal({
        slug: 'sy-atlas-translations',
        locale: 'en',
        draft: true,
        data: { _status: 'draft', countries: { title: UNPUBLISHED } } as never,
        overrideAccess: true,
      })
    })

    it('serves published copy to a client asking for draft: true', async () => {
      const result = (await payload.findGlobal({
        slug: 'sy-atlas-translations',
        select: { countries: true },
        depth: 0,
        draft: true,
        req: clientReq(),
        overrideAccess: false,
      })) as unknown as { countries?: { title?: string } }

      expect(result.countries?.title).toBe(PUBLISHED)
    })

    it('serves the draft to a client holding a live-preview token', async () => {
      // The other half of the gate. Without this, a change that simply refused
      // every draft read would pass every other case in this block while
      // breaking live preview outright.
      const token = await mintLivePreviewToken('wm-web', serverEnv.LIVE_PREVIEW_SIGNING_KEY)
      expect(token).toBeTruthy()

      const req = clientReq()
      req.headers.set(PREVIEW_SECRET_HEADER, token!)
      await resolveLivePreviewHook({ req })

      const result = (await payload.findGlobal({
        slug: 'sy-atlas-translations',
        select: { countries: true },
        depth: 0,
        draft: true,
        req,
        overrideAccess: false,
      })) as unknown as { countries?: { title?: string } }

      expect(result.countries?.title).toBe(UNPUBLISHED)
    })

    it('serves published copy when the token is not one this service issued', async () => {
      const req = clientReq()
      req.headers.set(PREVIEW_SECRET_HEADER, 'forged.token')
      await resolveLivePreviewHook({ req })

      const result = (await payload.findGlobal({
        slug: 'sy-atlas-translations',
        select: { countries: true },
        depth: 0,
        draft: true,
        req,
        overrideAccess: false,
      })) as unknown as { countries?: { title?: string } }

      expect(result.countries?.title).toBe(PUBLISHED)
    })

    it('serves published copy over REST with ?draft=true', async () => {
      const { status, raw } = await restGet(
        '/api/globals/sy-atlas-translations?select[countries]=true&depth=0&draft=true',
      )
      expect(status).toBe(200)
      expect(raw).not.toContain(UNPUBLISHED)
    })
  })

  describe('the REST default for overrideAccess', () => {
    it('refuses a REST client global read carrying no select', async () => {
      const { status, raw } = await restGet('/api/globals/sy-atlas-config')
      expect(status).toBe(400)
      expect(raw).toMatch(/select/)
    })

    it('allows the same REST read once it declares its fields', async () => {
      const { status } = await restGet(
        '/api/globals/sy-atlas-config?select[availableLocales]=true&depth=1',
      )
      expect(status).toBe(200)
    })
  })
})
