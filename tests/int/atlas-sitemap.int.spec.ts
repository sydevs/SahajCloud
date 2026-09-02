import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { atlasSeo } from '@/endpoints/atlas/seo'
import { atlasSitemap } from '@/endpoints/atlas/sitemap'
import type { AtlasSeoResponse, AtlasSitemapResponse } from '@/endpoints/responseTypes'
import type { Event } from '@/payload-types'

import { createData, testData, type FixtureOverrides } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * `GET /api/atlas/sitemap` (#650) — the half that needs a database: resolving
 * ownership to a set of regions, reading each document's own canonical rather
 * than composing one, and proving that canonical is the *same string*
 * `GET /api/atlas/seo` answers with. The pure ownership/shaping rules are in
 * `tests/unit/atlas-sitemap.spec.ts`.
 *
 * The tree, built once for the suite:
 *
 *   netherlands          ← owned by the NL client (path routing, mount `/find-a-class`)
 *   ├─ amsterdam             + a class, a draft class, and a finished class
 *   │   └─ community-hall    + a class   ← a shared venue under the city
 *   ├─ utrecht           ← owned by a NEARER client (query routing) — carved out of NL's
 *   │   └─ + a class
 *   └─ groningen         ← owned by NL, and empty: no class at it or beneath it
 *   france               ← unowned, so it falls back to the We Meditate surface
 *   └─ lyon                  + a class
 *
 * Four things are load-bearing. `utrecht` proves the nearest-ancestor rule
 * applies in this direction too — a country-level client must not publish a city
 * another client owns. `france` proves an unowned subtree belongs to nobody's
 * sitemap rather than defaulting into the caller's. `groningen` pins the
 * decision to publish an empty region rather than filter it. And the two clients
 * route differently (`path` vs `query`), so the byte-identity assertion covers
 * both URL shapes rather than the one the builder happens to be simplest at.
 */

type TestUser = {
  id: number | string
  collection: string
  _status?: 'published' | 'draft'
  roles?: string[]
} | null

type SitemapBody = AtlasSitemapResponse & { errors?: { message: string }[] }
type SeoBody = AtlasSeoResponse & { errors?: { message: string }[] }

// Annotated rather than `as const`: the latter freezes `weekdays` into a
// readonly tuple, which the mutable schema field won't accept.
const SCHEDULE: NonNullable<FixtureOverrides<Event>['schedule']> = {
  firstDate: '2026-01-06T10:00:00.000Z',
  firstDate_tz: 'Europe/London',
  recurrenceType: 'WEEKLY',
  interval: 1,
  weekdays: ['MO'],
}

const NL_DOMAIN = 'sahajayoga.nl'
const NL_MOUNT = '/find-a-class'
const UTRECHT_DOMAIN = 'sahajayogautrecht.nl'
const UTRECHT_MOUNT = '/lessen/'

describe('atlasSitemap endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let managerId: number

  let nlClient: TestUser
  let utrechtClient: TestUser
  let unownedClient: TestUser

  const region: Record<string, number> = {}
  const event: Record<string, number> = {}

  const mockReq = (user: TestUser, query: Record<string, unknown> = {}) =>
    ({
      payload,
      query,
      headers: new Headers(),
      routeParams: {},
      context: {},
      user,
    }) as unknown as PayloadRequest

  async function callSitemap(
    user: TestUser,
  ): Promise<{ status: number; headers: Headers; body: SitemapBody }> {
    const response = (await atlasSitemap.handler(mockReq(user))) as Response
    return { status: response.status, headers: response.headers, body: await response.json() }
  }

  async function callSeo(route: string, user: TestUser): Promise<SeoBody> {
    const response = (await atlasSeo.handler(mockReq(user, { route }))) as Response
    return response.json() as Promise<SeoBody>
  }

  const createRegion = (args: {
    name: string
    slug: string
    level: string
    parent?: number
  }): Promise<number> =>
    payload
      .create({
        collection: 'regions',
        overrideAccess: true,
        data: {
          name: args.name,
          slug: args.slug,
          level: args.level,
          mapboxId: `sitemap-${args.slug}`,
          ...(args.parent ? { parent: args.parent } : {}),
        } as never,
      })
      .then((doc) => doc.id)

  const createEvent = (overrides: FixtureOverrides<Event>): Promise<number> =>
    payload
      .create({
        collection: 'events',
        overrideAccess: true,
        data: createData<'events'>({
          languages: ['en'],
          registrationMode: 'sahaj-atlas',
          manager: managerId,
          schedule: SCHEDULE,
          eventType: 'offline',
          address: {
            street: '1 Test St',
            city: 'Amsterdam',
            country: 'NL',
            latitude: 52.37,
            longitude: 4.89,
          },
          _status: 'published',
          ...overrides,
        }),
      })
      .then((doc) => doc.id)

  /**
   * A canonical-owning client. The host/mount/routing a canonical is built from
   * live in `canonical.verification.verified` — job-written from what the CMS
   * observed on the live page — so both halves have to be set for a client to
   * own anything (#633's trust boundary, consumed by #640).
   */
  const createOwner = async (args: {
    name: string
    regionId: number
    domain: string
    mount: string
    routing: 'path' | 'query'
  }): Promise<TestUser> => {
    const doc = await testData.createClient(payload, managerId, {
      name: args.name,
      roles: ['sahaj-atlas-client'],
      region: args.regionId,
      canonical: {
        enabled: true,
        embed: `https://${args.domain}${args.mount}`,
        verification: {
          verified: {
            domain: args.domain,
            mount: args.mount,
            routing: args.routing,
            widgetVersion: 2,
            at: '2026-08-18T00:00:00.000Z',
          },
          failureCount: 0,
          attempts: [],
        },
      },
      _status: 'published',
    } as never)
    return {
      id: doc.id,
      collection: 'clients',
      _status: 'published',
      roles: ['sahaj-atlas-client'],
    }
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const manager = await testData.createManager(payload, {
      name: 'Sitemap Manager',
      email: 'sitemap-manager@example.com',
    })
    managerId = manager.id

    region.netherlands = await createRegion({
      name: 'Netherlands',
      slug: 'netherlands',
      level: 'country',
    })
    region.amsterdam = await createRegion({
      name: 'Amsterdam',
      slug: 'amsterdam',
      level: 'city',
      parent: region.netherlands,
    })
    region.hall = await createRegion({
      name: 'Community Hall',
      slug: 'community-hall',
      level: 'venue',
      parent: region.amsterdam,
    })
    region.utrecht = await createRegion({
      name: 'Utrecht',
      slug: 'utrecht',
      level: 'city',
      parent: region.netherlands,
    })
    // Owned, and empty — no class at it or beneath it, ever. Deliberately
    // published anyway; see the case that pins it.
    region.groningen = await createRegion({
      name: 'Groningen',
      slug: 'groningen',
      level: 'city',
      parent: region.netherlands,
    })
    region.france = await createRegion({ name: 'France', slug: 'france', level: 'country' })
    region.lyon = await createRegion({
      name: 'Lyon',
      slug: 'lyon',
      level: 'city',
      parent: region.france,
    })

    nlClient = await createOwner({
      name: 'NL Atlas Client',
      regionId: region.netherlands,
      domain: NL_DOMAIN,
      mount: NL_MOUNT,
      routing: 'path',
    })
    utrechtClient = await createOwner({
      name: 'Utrecht Atlas Client',
      regionId: region.utrecht,
      domain: UTRECHT_DOMAIN,
      mount: UTRECHT_MOUNT,
      routing: 'query',
    })

    const plain = await testData.createClient(payload, managerId, {
      name: 'Atlas Sitemap Reader',
      roles: ['sahaj-atlas-client'],
    })
    unownedClient = {
      id: plain.id,
      collection: 'clients',
      _status: 'published',
      roles: ['sahaj-atlas-client'],
    }

    event.city = await createEvent({ title: 'Amsterdam Meditation', region: region.amsterdam })
    event.venue = await createEvent({ title: 'Hall Meditation', region: region.hall })
    event.utrecht = await createEvent({ title: 'Utrecht Meditation', region: region.utrecht })
    event.lyon = await createEvent({ title: 'Lyon Meditation', region: region.lyon })
    event.draft = await createEvent({
      title: 'Unpublished Meditation',
      region: region.amsterdam,
      _status: 'draft',
    })
    // A one-off whose only occurrence is long past, so `schedule.lastDate` (end
    // of that local day) is behind us. It stays *published* — its page must keep
    // resolving for a late seeker — so nothing but the read filter keeps it out.
    event.finished = await createEvent({
      title: 'Finished Meditation',
      region: region.amsterdam,
      schedule: { firstDate: '2020-05-01T10:00:00.000Z', firstDate_tz: 'Europe/London' },
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  const routesFor = async (user: TestUser): Promise<string[]> =>
    (await callSitemap(user)).body.urls.map((url) => url.route)

  describe('auth gate', () => {
    it.each([
      ['unauthenticated callers', null],
      ['managers', { id: 1, collection: 'managers' }],
      ['unpublished (draft) clients', { id: 1, collection: 'clients', _status: 'draft' as const }],
    ])('rejects %s with 403', async (_label, user) => {
      const { status } = await callSitemap(user as TestUser)
      expect(status).toBe(403)
    })
  })

  describe('ownership', () => {
    it('answers with the region subtree the caller owns, and the classes in it', async () => {
      const { status, body } = await callSitemap(nlClient)
      expect(status).toBe(200)
      expect(body.urls.map((url) => url.route)).toEqual([
        '/netherlands',
        '/netherlands/amsterdam',
        `/netherlands/amsterdam/${event.city}`,
        '/netherlands/amsterdam/community-hall',
        `/netherlands/amsterdam/community-hall/${event.venue}`,
        '/netherlands/groningen',
      ])
    })

    // A deliberate decision, not an oversight, and pinned so it stays one.
    //
    // A region with no classes anywhere beneath it is still published. Regions
    // are curated by hand rather than generated from a geography feed, so an
    // empty one is a place we expect classes in shortly — not filler. That is
    // what separates this from the thin-content/doorway pattern Google
    // penalises, where the pages are mass-generated and stay empty.
    //
    // Excluding them would also make a region flicker in and out of the sitemap
    // as its last class expires and a new one is added, which tells a crawler
    // less than a stable URL with an honest `lastmod`.
    it('publishes an owned region with no classes anywhere beneath it', async () => {
      const routes = await routesFor(nlClient)
      expect(routes).toContain('/netherlands/groningen')
      // …and nothing beneath it, because there is nothing beneath it.
      expect(routes.filter((route) => route.startsWith('/netherlands/groningen/'))).toEqual([])
    })

    // The rule that makes this endpoint safe to hand to a country-level client:
    // a city another client declared is canonically *that* client's, so
    // publishing it here would be a sitemap advertising somebody else's pages.
    it('carves out a subtree a nearer client owns', async () => {
      const nl = await routesFor(nlClient)
      expect(nl).not.toContain('/netherlands/utrecht')
      expect(nl).not.toContain(`/netherlands/utrecht/${event.utrecht}`)

      expect(await routesFor(utrechtClient)).toEqual([
        '/netherlands/utrecht',
        `/netherlands/utrecht/${event.utrecht}`,
      ])
    })

    it('never leaks a subtree nobody owns into a caller’s sitemap', async () => {
      for (const user of [nlClient, utrechtClient, unownedClient]) {
        const routes = await routesFor(user)
        expect(routes).not.toContain('/france')
        expect(routes).not.toContain('/france/lyon')
      }
    })

    // Owning no subtree is a state, not an error — and the count is the
    // consumer's only signal, so it must be able to read one.
    it('gives a client with no owned subtree an empty list, not a 404', async () => {
      const { status, body } = await callSitemap(unownedClient)
      expect(status).toBe(200)
      expect(body.urls).toEqual([])
      expect(body.generated).toEqual(expect.any(String))
    })

    // The flip side of the case above, and the reason it needs its own guard:
    // "owns nothing" is a legitimate 200, so an id that matches no owner
    // *because it is unusable* would be indistinguishable from it — and a
    // consumer told it owns nothing publishes an empty sitemap, which is how a
    // site asks to be de-indexed. Fail loudly instead.
    it('refuses an unusable client id rather than reporting an empty sitemap', async () => {
      const { status, body } = await callSitemap({
        id: 'not-an-integer',
        collection: 'clients',
        _status: 'published',
        roles: ['sahaj-atlas-client'],
      })
      expect(status).toBe(500)
      expect(body.urls).toBeUndefined()
    })
  })

  describe('what is publishable', () => {
    it('never lists an unpublished class', async () => {
      expect(await routesFor(nlClient)).not.toContain(`/netherlands/amsterdam/${event.draft}`)
    })

    // A finished class stays published so an old inbound link still lands
    // somewhere — but a sitemap asks a crawler to index a page, and a class that
    // no longer happens is not one to index. Same rule as the map feed and a
    // region page's listing.
    it('never lists a class whose schedule has run out, though its page still resolves', async () => {
      expect(await routesFor(nlClient)).not.toContain(`/netherlands/amsterdam/${event.finished}`)

      const doc = await payload.findByID({
        collection: 'events',
        id: event.finished,
        depth: 0,
        overrideAccess: true,
      })
      expect(doc._status).toBe('published')
      expect(doc.webUrl).toBeTruthy()
    })

    it('carries each document’s own updatedAt as lastmod', async () => {
      const { body } = await callSitemap(nlClient)
      const row = body.urls.find((url) => url.route === '/netherlands/amsterdam')!
      const doc = await payload.findByID({
        collection: 'regions',
        id: region.amsterdam,
        depth: 0,
        overrideAccess: true,
      })
      expect(row.lastmod).toBe(doc.updatedAt)
    })
  })

  /**
   * The claim the ticket exists for. A sitemap is the one artefact whose whole
   * job is to publish URLs a crawler will fetch, so a `loc` that disagrees with
   * the page's own `<link rel="canonical">` is a 404 submitted to Google on
   * purpose. Both endpoints must be reading one value, not composing two.
   */
  describe('agreement with GET /api/atlas/seo', () => {
    it.each([
      ['path routing', () => nlClient],
      ['query routing', () => utrechtClient],
    ])('gives every loc byte-identical to /seo’s canonical (%s)', async (_label, user) => {
      const { body } = await callSitemap(user())
      expect(body.urls.length).toBeGreaterThan(0)

      for (const url of body.urls) {
        const seo = await callSeo(url.route, user())
        expect(seo.canonical, `canonical for ${url.route}`).toBe(url.loc)
        // …and the route round-trips: /seo resolved it to the same document,
        // rather than to an ancestor or a descendant that shares its trail.
        expect(seo.route, `route for ${url.route}`).toBe(url.route)
      }
    })

    it('builds each owner’s URLs on that owner’s own host and routing shape', async () => {
      const nl = await callSitemap(nlClient)
      for (const url of nl.body.urls) {
        expect(url.loc).toBe(`https://${NL_DOMAIN}${NL_MOUNT}${url.route}`)
      }

      const utrecht = await callSitemap(utrechtClient)
      for (const url of utrecht.body.urls) {
        expect(url.loc).toBe(`https://${UTRECHT_DOMAIN}${UTRECHT_MOUNT}?atlas=${url.route}`)
      }
    })
  })

  /**
   * The canonical fallback client (#652) — the half that needs a database.
   *
   * Declared last and on regions of its own, so every case above ran against the
   * pre-#652 world and this block is the only one that changes it. `france` and
   * `lyon` stay unclaimed throughout, which is what makes them the complement.
   *
   * **Fixture assumption, checked before writing it:** a fallback client is an
   * ordinary canonical owner — published, `canonical.enabled`, a region, and a
   * job-written `canonical.verification.verified` — so it is built with the same
   * `createOwner` helper every other owner here uses. Verified against
   * `src/jobs/VerifyEmbeds/VerifyEmbeds.ts:78` (`dueClients` selects only
   * `canonical.enabled === true`, so no other shape ever gets `verified`
   * written) and `src/collections/Clients/hooks/validateCanonicalOwnership.ts:60`
   * (an enabled client must name a region).
   */
  describe('canonical fallback client', () => {
    const WM_DOMAIN = 'wemeditate.com'
    const WM_MOUNT = '/map'
    let fallbackClient: TestUser

    const setFallback = (clientId: number | null) =>
      payload.updateGlobal({
        slug: 'sy-atlas-config',
        data: { canonicalFallbackClient: clientId } as never,
        overrideAccess: true,
      })

    beforeAll(async () => {
      // A root of its own, so the client declares a subtree like any other owner
      // *and* covers the remainder — the two halves the answer is a union of.
      region.belgium = await createRegion({ name: 'Belgium', slug: 'belgium', level: 'country' })
      fallbackClient = await createOwner({
        name: 'We Meditate',
        regionId: region.belgium,
        domain: WM_DOMAIN,
        mount: WM_MOUNT,
        routing: 'path',
      })
      await setFallback(Number(fallbackClient!.id))
    })

    afterAll(async () => {
      await setFallback(null)
    })

    it('publishes every route no other client owns, plus its own subtree', async () => {
      const routes = await routesFor(fallbackClient)

      // The complement: France, the city beneath it, and the class in that city
      // — the inventory that belonged to nobody's sitemap before this field.
      expect(routes).toContain('/france')
      expect(routes).toContain('/france/lyon')
      expect(routes).toContain(`/france/lyon/${event.lyon}`)
      // …and the subtree it declares itself, in the same sorted answer.
      expect(routes).toContain('/belgium')
      expect(routes).toEqual([...routes].sort())
    })

    it('still stops at a subtree another client owns', async () => {
      const routes = await routesFor(fallbackClient)
      for (const route of routes) expect(route.startsWith('/netherlands')).toBe(false)
    })

    it('changes no other client’s answer', async () => {
      expect(await routesFor(nlClient)).toEqual([
        '/netherlands',
        '/netherlands/amsterdam',
        `/netherlands/amsterdam/${event.city}`,
        '/netherlands/amsterdam/community-hall',
        `/netherlands/amsterdam/community-hall/${event.venue}`,
        '/netherlands/groningen',
      ])
      expect(await routesFor(unownedClient)).toEqual([])
    })

    // The second half of what the field buys: an unclaimed region's canonical
    // stops being asserted from env vars and becomes the host the verification
    // job observed — and `/seo` and the sitemap move together, because both read
    // the document's own `webUrl`.
    it('builds the unclaimed routes on the fallback client’s verified host', async () => {
      const { body } = await callSitemap(fallbackClient)
      expect(body.urls.length).toBeGreaterThan(0)

      for (const url of body.urls) {
        expect(url.loc).toBe(`https://${WM_DOMAIN}${WM_MOUNT}${url.route}`)
        const seo = await callSeo(url.route, fallbackClient)
        expect(seo.canonical, `canonical for ${url.route}`).toBe(url.loc)
      }
    })

    /**
     * The clause the other cases cannot reach, and the reason it exists.
     *
     * `verified` is deliberately **not** cleared when verification fails — it is
     * the last thing we observed (`buildVerificationState`) — while the job
     * switches `canonical.enabled` off after repeated failures
     * (`VerifyEmbeds.updateSql`). So "switched off, still carrying a verified
     * snapshot" is a state production reaches on its own, and a fallback
     * resolver reading `verified` alone would let a client the job has just
     * given up on keep speaking for every unclaimed page in the atlas.
     */
    it('ignores a client the verification job switched off, verified snapshot and all', async () => {
      region.austria = await createRegion({ name: 'Austria', slug: 'austria', level: 'country' })
      const lapsed = await createOwner({
        name: 'Lapsed Atlas Client',
        regionId: region.austria,
        domain: 'lapsed.test',
        mount: '/map',
        routing: 'path',
      })
      const stored = await payload.findByID({
        collection: 'clients',
        id: Number(lapsed!.id),
        depth: 0,
        overrideAccess: true,
      })
      await payload.update({
        collection: 'clients',
        id: Number(lapsed!.id),
        // Spread, so the verified snapshot survives exactly as the job leaves it.
        data: { canonical: { ...stored.canonical, enabled: false } } as never,
        overrideAccess: true,
      })

      await setFallback(Number(lapsed!.id))
      try {
        expect(await routesFor(lapsed)).toEqual([])
        const seo = await callSeo('/france', nlClient)
        expect(seo.canonical).not.toContain('lapsed.test')
      } finally {
        await setFallback(Number(fallbackClient!.id))
      }
    })

    it('reverts to the env-var surface when the named client cannot publish', async () => {
      // `unownedClient` is published and readable but declares no canonical
      // ownership at all — the "named a client whose embed has not verified"
      // case, which must read exactly as an unset field does.
      await setFallback(Number(unownedClient!.id))
      try {
        expect(await routesFor(unownedClient)).toEqual([])
        for (const user of [nlClient, utrechtClient, fallbackClient]) {
          expect(await routesFor(user)).not.toContain('/france')
        }
        const seo = await callSeo('/france', nlClient)
        expect(seo.canonical).not.toContain(WM_DOMAIN)
      } finally {
        await setFallback(Number(fallbackClient!.id))
      }
    })
  })

  describe('response envelope', () => {
    // This answer differs per API key, unlike /seo. `Vary: Authorization` is
    // what keeps the edge from serving one client's owned routes to another.
    it('is edge-cached per API key, not shared across clients', async () => {
      const { headers } = await callSitemap(nlClient)
      expect(headers.get('Vary')).toBe('Authorization')
      expect(headers.get('Cache-Control')).toContain('s-maxage=')
      expect(headers.get('Cache-Tag')).toBe('events,regions')
    })

    it('stamps the moment it was built', async () => {
      const before = Date.now()
      const { body } = await callSitemap(nlClient)
      const generated = Date.parse(body.generated)
      expect(Number.isNaN(generated)).toBe(false)
      expect(generated).toBeGreaterThanOrEqual(before - 1000)
    })
  })
})
