/**
 * What one client request costs the usage meter.
 *
 * Every case reads the counter, drives a **real** read, and asserts the delta.
 * That is the whole design of this file, because the version it replaced wrote
 * the value it then asserted: 7 of its 8 cases ran `payload.update` setting
 * `dailyRequests = initial + 1` by hand and expected `initial + 1`, so they
 * passed against any implementation, including none. The eighth read `managers`
 * as a manager and asserted the *client* row was unchanged — true whatever the
 * hook does. `tests/int/globals-client-reads.int.spec.ts` is the honest shape
 * this follows.
 *
 * ⚠ **A route billing 0 is as wrong as one billing 5**, so every case asserts a
 * number rather than "fewer than before". A custom endpoint runs none of its
 * collection's `beforeOperation` hooks, so a fix that only stopped counting
 * forwarded reads would have billed seven routes nothing (#891).
 *
 * The routes are enumerated deliberately. `/api/clients/report` is the one
 * client-reachable route absent from the list, because `clients` is excluded
 * from the usage plugin and that route bills nothing by design
 * (`docs/rules/api-clients.md`).
 *
 * ## Which cases are regression tests, and which are contract pins
 *
 * Measured by reverting each half of the fix, not asserted:
 *
 * - **Remove the per-request cell** and seven go red at 2, 2, 2, 4, 4, 2 and 6
 *   — related-lectures, related-meditations, by-narrator, sitemap, the seo
 *   region route, the `webPath` read, and the cell case itself.
 * - **Remove the two root endpoints' `countClientRead`** and exactly one goes
 *   red, at 0: the seo **root** route. The sitemap's own reads bill it anyway,
 *   so its call is a floor rather than the only bill.
 * - Of the eleven route cases, five pass under **both** reverts: `/songs`, both
 *   `/for-audience` feeds, `/for-user`, and `geojson` — with these fixtures
 *   each reaches exactly one metered read, and `geojson` is meant to. They are
 *   **contract pins**, not regression tests: they go red if a route ever bills
 *   0 or 2, which is what the enumeration is for, and they are the reason this
 *   file names every route rather than only the ones that were wrong.
 */

import type { Endpoint, Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { appCardsForAudience } from '@/collections/AppCards/endpoints/forAudience'
import { audiencesForUser } from '@/collections/Audiences/endpoints/forUser'
import { eventsGeoJson } from '@/collections/Events/endpoints/geojson'
import { framesByNarrator } from '@/collections/Frames/endpoints/byNarrator'
import { lecturesForAudience } from '@/collections/Lectures/endpoints/forAudience'
import { lectureRelatedMeditations } from '@/collections/Lectures/endpoints/relatedMeditations'
import { meditationLectures } from '@/collections/Meditations/endpoints/lectures'
import { meditationSongs } from '@/collections/Meditations/endpoints/songs'
import { atlasSeo } from '@/endpoints/atlas/seo'
import { atlasSitemap } from '@/endpoints/atlas/sitemap'
import type { Client } from '@/payload-types'
import { asTrustedReq } from '@/plugins/usage/hooks'

import { testData } from 'tests/utils/testData'

import { createClientAuthenticatedRequest, createTestEnvironment } from '../utils/testHelpers'

// `createLecture` goes through `populateFromNirmalaVidya`, which fetches
// mapi.nirmalavidya.org. Nothing in this lane may reach the network, and
// `createLecture`'s own JSDoc asks each spec to declare this.
vi.mock('@/lib/lectures/nirmalaVidyaApi', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/lectures/nirmalaVidyaApi')>()
  return {
    extractVimeoId: vi.fn(original.extractVimeoId),
    fetchNirmalaVidyaVideo: vi.fn().mockResolvedValue({
      title: 'Test Lecture from Nirmala Vidya',
      thumbnailUrl: 'https://example.com/thumbnail.jpg',
      hlsUrl: 'https://example.com/video.m3u8',
      subtitles: [],
    }),
  }
})

/** The verified host the owning client publishes canonical URLs on. */
const OWNER_DOMAIN = 'usage-meter.example'
const API_KEY = 'usage-meter-spec-key'

/**
 * Both roles, on purpose. `regions` and `events` live only in the `sahaj-atlas`
 * project; `meditations`, `lectures`, `audiences`, `app-cards`, `narrators` and
 * `frames` only in `wemeditate-app`. One request has to reach both halves,
 * because the meter is one mechanism across them.
 */
const ROLES = ['sahaj-atlas-client', 'wemeditate-app-client']

describe('usage metering, per client-reachable route (#891)', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let clientId: number
  let managerId: number
  let audienceId: number
  let meditationId: number
  let lectureId: number
  let narratorId: number

  /** The five keys every request stub here shares, plus whoever is calling. */
  function reqAs(
    user: unknown,
    headers: Headers,
    opts: { query?: Record<string, unknown>; routeParams?: Record<string, unknown> },
  ): PayloadRequest {
    return {
      payload,
      headers,
      query: opts.query ?? {},
      routeParams: opts.routeParams ?? {},
      context: {},
      user,
    } as unknown as PayloadRequest
  }

  /**
   * A client request, exactly as API-key auth builds one.
   *
   * `createClientAuthenticatedRequest` owns the two load-bearing details — the
   * id must be numeric or self-access silently denies, and `_status:
   * 'published'` is the auth gate — so they are not restated here.
   */
  function clientReq(
    opts: {
      query?: Record<string, unknown>
      routeParams?: Record<string, unknown>
      origin?: string
      allowedDomains?: string
    } = {},
  ): PayloadRequest {
    const { headers, user } = createClientAuthenticatedRequest(clientId, API_KEY, ROLES)
    if (opts.origin) (headers as Headers).set('origin', opts.origin)
    return reqAs({ ...user, allowedDomains: opts.allowedDomains ?? null }, headers as Headers, opts)
  }

  /** The same shape for a manager, whose reads must never touch a client row. */
  function managerReq(): PayloadRequest {
    return reqAs({ id: managerId, collection: 'managers', type: 'admin' }, new Headers(), {})
  }

  /** The client's daily counter, read straight from the row. */
  async function dailyRequests(): Promise<number> {
    const row = (await payload.findByID({ collection: 'clients', id: clientId })) as Client
    return row.usage?.dailyRequests ?? 0
  }

  /**
   * What `run` cost the client. `clients` is excluded from the usage plugin, so
   * the two counter reads around it bill nothing themselves.
   */
  async function billedBy(run: () => Promise<unknown>): Promise<number> {
    const before = await dailyRequests()
    await run()
    return (await dailyRequests()) - before
  }

  /** Drive one endpoint's handler, as `atlas-sitemap.int.spec.ts` does. */
  function callHandler(endpoint: Endpoint, req: PayloadRequest): Promise<Response> {
    return (endpoint.handler as (r: PayloadRequest) => Promise<Response>)(req)
  }

  /** `run` bills exactly one request, and its response says the reads happened. */
  async function expectOneBill(run: () => Promise<Response>): Promise<void> {
    let status = 0
    const billed = await billedBy(async () => {
      status = (await run()).status
    })
    expect(status).toBe(200)
    expect(billed).toBe(1)
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    managerId = env.adminUser.id

    const country = await testData.createRegion(payload, {
      name: 'Usageland',
      slug: 'usageland',
      level: 'country',
    })

    // The client owns `usageland`, so `GET /api/atlas/sitemap` reaches
    // `ownedDocuments` and its two reads. A client owning nothing returns
    // before them, and that case would pass for the wrong reason.
    //
    // Ownership needs BOTH halves (#633): the operator's `canonical.embed`
    // nomination, and the CMS-written `verification.verified` snapshot that
    // `canonicalOwnerFrom` requires before it will publish a URL. Shape copied
    // from `tests/int/atlas-sitemap.int.spec.ts`, which owns this fixture's
    // reasoning — checked against `src/lib/clients/verification.ts`, the closed
    // schema every `clients` save validates this object against.
    const client = await testData.createClient(payload, managerId, {
      name: 'Usage Meter Client',
      roles: ROLES,
      apiKey: API_KEY,
      region: country.id,
      canonical: {
        enabled: true,
        embed: `https://${OWNER_DOMAIN}/map`,
        verification: {
          verified: {
            domain: OWNER_DOMAIN,
            mount: '/map',
            routing: 'path',
            widgetVersion: 2,
            at: '2026-08-18T00:00:00.000Z',
          },
          failureCount: 0,
          attempts: [],
          routingProbe: { at: '2026-08-18T00:00:00.000Z', verdict: 'path', failedAttempts: 0 },
        },
      },
      _status: 'published',
    } as never)
    clientId = client.id

    const audience = await testData.createAudience(payload, { label: 'Usage Meter Audience' })
    audienceId = audience.id

    const narrator = await testData.createNarrator(payload, { name: 'Usage Meter Narrator' })
    narratorId = narrator.id

    const meditation = await testData.createMeditation(payload, { narrator: narratorId })
    meditationId = meditation.id

    const lecture = await testData.createLecture(payload, undefined, {
      title: 'Usage Meter Lecture',
      audiences: [audienceId],
    })
    lectureId = lecture.id
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('a custom endpoint bills exactly one request', () => {
    // Every route under `src/collections/*/endpoints/` and `src/endpoints/` that
    // a published client can reach, except `/api/clients/report` — see the head
    // of this file. On `main` these billed 0 to 5.

    it('GET /api/meditations/:id/related-lectures', async () => {
      // Four forwarded reads plus `recomputeWeightsForMeditation`'s own, every
      // one of them `asTrustedReq`. On `main` this route billed 3 to 5.
      await expectOneBill(() =>
        callHandler(
          meditationLectures,
          clientReq({
            routeParams: { id: meditationId },
            query: { audiences: String(audienceId), limit: '5' },
          }),
        ),
      )
    })

    it('GET /api/meditations/:id/songs', async () => {
      await expectOneBill(() =>
        callHandler(meditationSongs, clientReq({ routeParams: { id: meditationId } })),
      )
    })

    it('GET /api/lectures/:id/related-meditations', async () => {
      await expectOneBill(() =>
        callHandler(
          lectureRelatedMeditations,
          clientReq({ routeParams: { id: lectureId }, query: { limit: '5' } }),
        ),
      )
    })

    it('GET /api/lectures/for-audience', async () => {
      await expectOneBill(() =>
        callHandler(
          lecturesForAudience,
          clientReq({ query: { audiences: String(audienceId), limit: '5' } }),
        ),
      )
    })

    it('GET /api/app-cards/for-audience', async () => {
      await expectOneBill(() =>
        callHandler(
          appCardsForAudience,
          clientReq({
            query: { audiences: String(audienceId), targetSection: 'hero', limit: '5' },
          }),
        ),
      )
    })

    it('GET /api/audiences/for-user', async () => {
      await expectOneBill(() =>
        callHandler(
          audiencesForUser,
          clientReq({
            query: {
              pathProgress: '0',
              meditationsPerWeek: '0',
              totalMeditationsViewed: '0',
              totalLecturesViewed: '0',
              country: 'NL',
            },
          }),
        ),
      )
    })

    it('GET /api/frames/by-narrator/:id', async () => {
      // Gated on `frames` read permission rather than `requireActiveClient`, so
      // this is also the one route whose client gate is a role check.
      await expectOneBill(() =>
        callHandler(
          framesByNarrator,
          clientReq({ routeParams: { narratorId: String(narratorId) } }),
        ),
      )
    })

    it('GET /api/atlas/sitemap', async () => {
      let urls = 0
      const billed = await billedBy(async () => {
        const response = await callHandler(atlasSitemap, clientReq())
        expect(response.status).toBe(200)
        urls = ((await response.json()) as { urls: unknown[] }).urls.length
      })
      // The owned subtree resolved, so `ownedDocuments` ran. Without this the
      // handler returns before both of its reads.
      expect(urls).toBeGreaterThan(0)
      expect(billed).toBe(1)
    })

    it('GET /api/atlas/seo for a region route', async () => {
      await expectOneBill(() => callHandler(atlasSeo, clientReq({ query: { route: '/usageland' } })))
    })

    it('GET /api/atlas/seo for the root route, which reads no metered collection', async () => {
      // The route that makes the "bills 0" half of this ticket concrete: it
      // resolves through two globals (skipped by `onlyOnCallerAuthority`) and the
      // caller's own `clients` row (an excluded collection), so no
      // `beforeOperation` chain runs and nothing billed it before #891. It is
      // why the two root endpoints call `countClientRead` themselves.
      await expectOneBill(() => callHandler(atlasSeo, clientReq({ query: { route: '/' } })))
    })

    it('GET /api/events/geojson', async () => {
      // `depth` is forwarded verbatim, so omitting it takes the server default
      // of 2 and the gate then demands `populate` — a 400 that bills nothing and
      // would read as this assertion holding.
      await expectOneBill(() =>
        callHandler(eventsGeoJson, clientReq({ query: { select: { title: true }, depth: '0' } })),
      )
    })
  })

  describe('an ordinary client read bills exactly one request', () => {
    it('a list read', async () => {
      const billed = await billedBy(() =>
        payload.find({
          collection: 'regions',
          select: { name: true },
          depth: 0,
          req: clientReq(),
        }),
      )
      expect(billed).toBe(1)
    })

    it('a read selecting webPath, which resolves the whole region tree', async () => {
      // `webPath`'s afterRead calls `getRegionWebPaths`, one more `regions` read
      // on the caller's own `req`. On `main` that billed a second request — and
      // the per-request memo capped it at one extra rather than one per row.
      const billed = await billedBy(async () => {
        const result = await payload.find({
          collection: 'regions',
          select: { webPath: true, webUrl: true },
          depth: 0,
          req: clientReq(),
        })
        // Non-vacuous only if the field resolved: a null `webPath` would mean
        // the resolver returned before reading anything.
        expect(result.docs[0]).toMatchObject({ webPath: '/usageland' })
      })
      expect(billed).toBe(1)
    })

    it('a read whose selected relationship populates', async () => {
      // Payload's own population sub-reads carry a numeric `currentDepth`, the
      // guard that was already here. #559 added it; this keeps it honest.
      const billed = await billedBy(() =>
        payload.find({
          collection: 'lectures',
          select: { title: true, audiences: true },
          depth: 2,
          populate: { audiences: { label: true } },
          req: clientReq(),
        }),
      )
      expect(billed).toBe(1)
    })

    it('a global read, whose surface this change does not touch', async () => {
      // Kept rather than left to #710's own spec: this PR moves the meter, so
      // the global surface staying put is a claim about *this* change.
      // `overrideAccess: false` is load-bearing — the wrapper
      // `onlyOnCallerAuthority` uses that flag as its internal-read exemption,
      // so omitting it skips every gate and the assertion proves nothing.
      const billed = await billedBy(() =>
        payload.findGlobal({
          slug: 'sy-atlas-config',
          select: { availableLocales: true },
          depth: 1,
          req: clientReq(),
          overrideAccess: false,
        }),
      )
      expect(billed).toBe(1)
    })
  })

  describe('the per-request cell', () => {
    it('bills once across several asTrustedReq copies of one request', async () => {
      // The mechanism, directly. Each `asTrustedReq` spreads `req.context` into
      // a NEW object, so a boolean flag written through one copy is invisible to
      // the next — the reason #559's `req.context` dedup never worked. The cell
      // is an object seeded on `req` itself, so every copy mutates one.
      const req = clientReq()
      const billed = await billedBy(async () => {
        for (let i = 0; i < 3; i++) {
          await payload.find({ collection: 'regions', depth: 0, req: asTrustedReq(req) })
        }
      })
      expect(billed).toBe(1)
    })

    it('bills each request separately', async () => {
      // The other direction, and what makes the case above non-trivial: the cell
      // is per request, so three requests cost three. A cell hoisted to module
      // or client scope would pass the case above and fail this one.
      const billed = await billedBy(async () => {
        for (let i = 0; i < 3; i++) {
          await payload.find({
            collection: 'regions',
            select: { name: true },
            depth: 0,
            req: clientReq(),
          })
        }
      })
      expect(billed).toBe(3)
    })
  })

  describe('a read that is not the client’s bills nothing', () => {
    it('a manager read', async () => {
      const billed = await billedBy(() =>
        payload.find({ collection: 'regions', depth: 0, req: managerReq() }),
      )
      expect(billed).toBe(0)
    })

    it('a read with no authenticated user', async () => {
      const billed = await billedBy(() =>
        payload.find({ collection: 'regions', depth: 0, overrideAccess: true }),
      )
      expect(billed).toBe(0)
    })
  })

  describe('a refused read costs no quota', () => {
    it('a client read carrying no select', async () => {
      // The select gate runs ahead of the meter, so the 400 is free.
      const billed = await billedBy(async () => {
        await expect(
          payload.find({ collection: 'regions', depth: 0, req: clientReq() }),
        ).rejects.toThrow(/select/)
      })
      expect(billed).toBe(0)
    })

    it('a client read from an origin outside allowedDomains', async () => {
      // Origin enforcement runs FIRST in the gate chain and the meter LAST
      // (`usagePlugin.ts`), so the 403 costs nothing.
      const billed = await billedBy(async () => {
        await expect(
          payload.find({
            collection: 'regions',
            select: { name: true },
            depth: 0,
            req: clientReq({ allowedDomains: 'allowed.org', origin: 'https://evil.org' }),
          }),
        ).rejects.toThrow(/origin is not allowed/)
      })
      expect(billed).toBe(0)
    })

    it('an endpoint whose forwarded read is refused for its origin', async () => {
      // ⚠ This pair is why the bill lands inside the first read rather than at
      // the top of a handler. A collection endpoint has no origin check of its
      // own — enforcement happens in the forwarded read's `beforeOperation`
      // chain, because `validateClientOriginHook` deliberately does not honour
      // `asTrustedReq`. A handler billing before its first read would let a
      // misconfigured or hostile host page drain a client's whole daily quota
      // while being refused every single time.
      const req = (origin: string) =>
        clientReq({ routeParams: { id: meditationId }, allowedDomains: 'allowed.org', origin })

      // The control. Without it the refusal below is indistinguishable from the
      // 404 this endpoint returns for a meditation that does not exist — it maps
      // a throwing `findByID` onto "treating as not found".
      const allowed = await billedBy(async () => {
        const response = await callHandler(meditationSongs, req('https://allowed.org'))
        expect(response.status).toBe(200)
      })
      expect(allowed).toBe(1)

      const refused = await billedBy(async () => {
        const response = await callHandler(meditationSongs, req('https://evil.org'))
        expect(response.status).toBe(404)
      })
      expect(refused).toBe(0)
    })
  })
})
