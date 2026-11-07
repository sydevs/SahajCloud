import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { atlasSeo } from '@/endpoints/atlas/seo'
import { atlasWixRoute } from '@/endpoints/atlas/wix/route'
import type { AtlasWixRouteResponse, AtlasWixSitemapEntry } from '@/endpoints/atlas/wix/shape'
import { atlasWixSitemap } from '@/endpoints/atlas/wix/sitemap'
import type { AtlasSeoResponse } from '@/endpoints/responseTypes'
import { PROBE_SEGMENT_PREFIX } from '@/lib/clients/verification'
import type { Event } from '@/payload-types'

import { createData, testData, type FixtureOverrides } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * `GET /api/atlas/wix/route` and `GET /api/atlas/wix/sitemap` (#1055) — the half
 * that needs a database.
 *
 * **The one thing only this file can assert**: that the Wix shape is a
 * serializer over the *same* resolution `/api/atlas/seo` answers, rather than a
 * second resolver. Every case below that compares the two endpoints exists for
 * that reason — the pure shaping rules are in
 * `tests/unit/wix-route-shape.spec.ts` and
 * `tests/unit/wix-route-body.spec.ts`, and neither can see a disagreement
 * between two reads.
 *
 * The tree, built once:
 *
 *   canada              ← owned by the Wix client (path routing, mount `/classes`)
 *   └─ ontario              + one published class
 *   germany             ← unowned
 */

type TestUser = {
  id: number | string
  collection: string
  enabled?: boolean
  roles?: string[]
  canonical?: Record<string, unknown>
  site?: Record<string, unknown>
  language?: string
} | null

const OWNER_DOMAIN = 'sahajayoga.ca'
const OWNER_MOUNT = '/classes'

const SCHEDULE: NonNullable<FixtureOverrides<Event>['schedule']> = {
  firstDate: '2026-01-06T10:00:00.000Z',
  // `Europe/London` because the timezone column is a Postgres enum of the
  // zones the schedule field offers, and `America/Toronto` is not one of them.
  firstDate_tz: 'Europe/London',
  recurrenceType: 'WEEKLY',
  interval: 1,
  weekdays: ['MO'],
}

describe('atlas Wix endpoints', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let owner: TestUser
  let stranger: TestUser
  let managerId: number
  const region: Record<string, number> = {}
  let eventId: number

  async function call<T>(
    endpoint: typeof atlasWixRoute,
    query: Record<string, unknown>,
    user: TestUser,
  ): Promise<{ status: number; body: T }> {
    const req = {
      payload,
      query,
      headers: new Headers(),
      routeParams: {},
      context: {},
      user,
    } as unknown as PayloadRequest
    const response = (await endpoint.handler(req)) as Response
    return { status: response.status, body: (await response.json()) as T }
  }

  const callRoute = (query: Record<string, unknown>, user: TestUser = owner) =>
    call<AtlasWixRouteResponse & { errors?: { message: string }[] }>(atlasWixRoute, query, user)

  const callSitemap = (query: Record<string, unknown>, user: TestUser = owner) =>
    call<AtlasWixSitemapEntry[] & { errors?: { message: string }[] }>(atlasWixSitemap, query, user)

  const callSeo = (query: Record<string, unknown>, user: TestUser = owner) =>
    call<AtlasSeoResponse>(atlasSeo, query, user)

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const manager = await testData.createManager(payload, {
      name: 'Wix Manager',
      email: 'wix-manager@example.com',
    })
    managerId = manager.id

    const createRegion = (args: { name: string; slug: string; level: string; parent?: number }) =>
      payload
        .create({
          collection: 'regions',
          overrideAccess: true,
          data: {
            name: args.name,
            slug: args.slug,
            level: args.level,
            mapboxId: `wix-${args.slug}`,
            ...(args.parent ? { parent: args.parent } : {}),
          } as never,
        })
        .then((doc) => doc.id)

    region.canada = await createRegion({ name: 'Canada', slug: 'canada', level: 'country' })
    region.ontario = await createRegion({
      name: 'Ontario',
      slug: 'ontario',
      level: 'city',
      parent: region.canada,
    })
    region.germany = await createRegion({ name: 'Germany', slug: 'germany', level: 'country' })

    // The router reads the primary page off the client (`site`), and the
    // canonical URLs off the verified snapshot beside it.
    const site = { domain: OWNER_DOMAIN, page: OWNER_MOUNT }
    const canonical = {
      owned: true,
      verification: {
        verified: {
          domain: OWNER_DOMAIN,
          mount: OWNER_MOUNT,
          widgetVersion: 3,
          at: '2026-10-01T00:00:00.000Z',
        },
        failureCount: 0,
        attempts: [],
        routingProbe: { at: '2026-10-01T00:00:00.000Z', verdict: 'path', failedAttempts: 0 },
      },
    }

    const ownerDoc = await testData.createClient(payload, managerId, {
      name: 'Wix Atlas Client',
      roles: ['sahaj-atlas-client'],
      region: region.canada,
      language: 'en',
      site,
      canonical,
      enabled: true,
    } as never)
    owner = {
      id: ownerDoc.id,
      collection: 'clients',
      enabled: true,
      roles: ['sahaj-atlas-client'],
      site,
      canonical,
      language: 'en',
    }

    const strangerDoc = await testData.createClient(payload, managerId, {
      name: 'Wix Reader',
      roles: ['sahaj-atlas-client'],
    })
    stranger = {
      id: strangerDoc.id,
      collection: 'clients',
      enabled: true,
      roles: ['sahaj-atlas-client'],
    }

    eventId = await payload
      .create({
        collection: 'events',
        overrideAccess: true,
        data: createData<'events'>({
          title: 'Thursday Ontario class',
          languages: ['en'],
          registrationMode: 'sahaj-atlas',
          manager: managerId,
          region: region.ontario,
          schedule: SCHEDULE,
          eventType: 'offline',
          address: {
            street: '1 Queen St',
            city: 'Toronto',
            country: 'CA',
            latitude: 43.65,
            longitude: -79.38,
          },
          _status: 'published',
        }),
      })
      .then((doc) => doc.id)
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('auth gate', () => {
    it.each([
      ['unauthenticated callers', null],
      ['managers', { id: 1, collection: 'managers' }],
      ['unpublished clients', { id: 1, collection: 'clients', enabled: false }],
    ])('refuses %s on both endpoints', async (_label, user) => {
      expect((await callRoute({ path: '/canada' }, user as TestUser)).status).toBe(403)
      expect((await callSitemap({ prefix: 'classes' }, user as TestUser)).status).toBe(403)
    })
  })

  describe('the route endpoint answers every route shape', () => {
    it('answers the root as a rendered page', async () => {
      const { body } = await callRoute({ path: '/', lang: 'en' })
      expect(body.status).toBe(200)
      // The root is always self-canonical, so Wix writes its own links.
      expect(body.head.links).toEqual([])
      expect(body.head.title.length).toBeGreaterThan(0)
    })

    it('answers a region, with its classes as real links in the body', async () => {
      const { body } = await callRoute({ path: '/canada/ontario', lang: 'en' })
      expect(body.status).toBe(200)
      expect(body.data?.bodyHtml).toContain('<h1>Ontario</h1>')
      expect(body.data?.bodyHtml).toContain('Thursday Ontario class')
      expect(body.data?.bodyHtml).toContain('<a href="https://sahajayoga.ca/classes/canada/ontario')
    })

    it('answers an event', async () => {
      const { body } = await callRoute({ path: `/canada/ontario/${eventId}`, lang: 'en' })
      expect(body.status).toBe(200)
      expect(body.data?.bodyHtml).toContain('<article>')
    })

    it('redirects a legacy prefix to the route the document lives at', async () => {
      const { body } = await callRoute({ path: `/events/${eventId}`, lang: 'en' })
      expect(body.status).toBe(301)
      expect(body.redirect).toBe(`/canada/ontario/${eventId}`)
      expect(body.data).toBeNull()
    })

    it('renders a view route rather than redirecting it', async () => {
      // The widget writes these links itself; a 301 would break its own
      // navigation.
      const { body } = await callRoute({ path: '/canada/ontario/calendar', lang: 'en' })
      expect(body.status).toBe(200)
      expect(body.data?.bodyHtml).toContain('<h1>Ontario</h1>')
      // And it publishes the canonical, so a crawler folds the two together.
      expect(body.head.links.some((link) => link.rel === 'canonical')).toBe(true)
    })

    it('answers an unknown route as a 404 for the page, at HTTP 200', async () => {
      const { status, body } = await callRoute({ path: '/zz/nothing', lang: 'en' })
      expect(status).toBe(200)
      expect(body.status).toBe(404)
      expect(body.data).toBeNull()
    })

    it('answers the routing probe as the root, with robots: noindex', async () => {
      // Or `probeRouting` fails against the host's real 404 and demotes every
      // working Wix client three probes later (#644).
      const { body } = await callRoute({ path: `/${PROBE_SEGMENT_PREFIX}abc123`, lang: 'en' })
      const root = await callRoute({ path: '/', lang: 'en' })
      expect(body.status).toBe(200)
      expect(body.head.title).toBe(root.body.head.title)
      expect(body.data?.bodyHtml).toBe(root.body.data?.bodyHtml)
      expect(body.head.metaTags).toContainEqual({ name: 'robots', content: 'noindex' })
    })

    it('refuses an empty path, which is a caller bug rather than a route', async () => {
      expect((await callRoute({ lang: 'en' })).status).toBe(400)
    })
  })

  describe('the Wix shape is the same document /api/atlas/seo answers', () => {
    it('publishes the identical title for the same route', async () => {
      const wix = await callRoute({ path: '/canada/ontario', lang: 'en' })
      const seo = await callSeo({ route: '/canada/ontario', locale: 'en' })
      expect(wix.body.head.title).toBe(seo.body.title)
    })

    it('publishes the identical canonical, never a recomposed one', async () => {
      const wix = await callRoute({ path: '/canada/ontario/calendar', lang: 'en' })
      const seo = await callSeo({ route: '/canada/ontario', locale: 'en' })
      const canonical = wix.body.head.links.find((link) => link.rel === 'canonical')
      expect(canonical?.href).toBe(seo.body.canonical)
    })

    it('publishes the identical JSON-LD, node for node', async () => {
      // The reason the serializer parses rather than rebuilding: two documents
      // for one route would be free to disagree.
      const wix = await callRoute({ path: '/canada/ontario', lang: 'en' })
      const seo = await callSeo({ route: '/canada/ontario', locale: 'en' })
      const parsed = JSON.parse(seo.body.jsonLd) as { '@graph': Record<string, unknown>[] }
      expect(wix.body.head.structuredData).toHaveLength(parsed['@graph'].length)
      expect(wix.body.head.structuredData[0]).toMatchObject(parsed['@graph'][0])
    })

    it('puts the description in metaTags and nowhere else', async () => {
      const wix = await callRoute({ path: `/canada/ontario/${eventId}`, lang: 'en' })
      const seo = await callSeo({ route: `/canada/ontario/${eventId}`, locale: 'en' })
      if (seo.body.description) {
        expect(wix.body.head.metaTags).toContainEqual({
          name: 'description',
          content: seo.body.description,
        })
      }
      expect(wix.body.head).not.toHaveProperty('description')
      expect(wix.body.head).not.toHaveProperty('noIndex')
    })
  })

  describe('canonical ownership decides the links', () => {
    it('leaves the root links empty, so Wix writes its own self-canonical', async () => {
      // The root is the one page that may not canonicalise elsewhere
      // (the WordPress plugin's trap 15).
      const { body } = await callRoute({ path: '/', lang: 'en' })
      expect(body.head.links).toEqual([])
    })

    it('leaves a region this client canonicalises on its own host self-canonical', async () => {
      const { body } = await callRoute({ path: '/canada/ontario', lang: 'en' })
      expect(body.head.links).toEqual([])
    })

    it('links a view of the root to the root, rather than leaving it a second page', async () => {
      const { body } = await callRoute({ path: '/calendar', lang: 'en' })
      expect(body.head.links).toContainEqual({
        rel: 'canonical',
        href: `https://${OWNER_DOMAIN}${OWNER_MOUNT}`,
      })
    })

    it('reads its own host through the www twin of the site domain', async () => {
      const twin = { ...owner!, site: { ...owner!.site, domain: `www.${OWNER_DOMAIN}` } }
      expect(
        (await callRoute({ path: '/canada/ontario', lang: 'en' }, twin)).body.head.links,
      ).toEqual([])
      const { body } = await callSitemap({ prefix: 'free-classes' }, twin)
      expect(body.map((entry) => entry.url)).toContain('/free-classes/canada/ontario')
    })

    it('publishes the canonical for a region owned somewhere else', async () => {
      const { body } = await callRoute({ path: '/germany', lang: 'en' })
      expect(body.head.links.some((link) => link.rel === 'canonical')).toBe(true)
    })
  })

  describe('a second language', () => {
    it('noindexes a sub-route in a language the site does not path-route', async () => {
      const { body } = await callRoute({ path: '/canada/ontario', lang: 'fr' })
      expect(body.head.metaTags).toContainEqual({ name: 'robots', content: 'noindex' })
    })

    it('reads no language as the site’s own, which need not be English', async () => {
      // The router sends no `lang` on a site's primary language.
      const french = { ...owner!, language: 'fr' }
      const { body } = await callRoute({ path: '/canada/ontario', lang: '' }, french)
      expect(body.head.metaTags).not.toContainEqual({ name: 'robots', content: 'noindex' })
      const english = await callRoute({ path: '/canada/ontario', lang: 'en' }, french)
      expect(english.body.head.metaTags).toContainEqual({ name: 'robots', content: 'noindex' })
    })

    it('leaves the root indexable, since Wix Multilingual declares its languages', async () => {
      const { body } = await callRoute({ path: '/', lang: 'fr' })
      expect(body.head.metaTags).not.toContainEqual({ name: 'robots', content: 'noindex' })
    })
  })

  describe('the sitemap endpoint', () => {
    it('lists this client own pages, relative and prefixed', async () => {
      const { body } = await callSitemap({ prefix: 'free-classes' })
      expect(body.map((entry) => entry.url)).toContain('/free-classes/canada/ontario')
      expect(body.every((entry) => entry.url.startsWith('/free-classes/'))).toBe(true)
    })

    it('names each page, so Wix own sitemap is not a list of blanks', async () => {
      const { body } = await callSitemap({ prefix: 'free-classes' })
      expect(body.find((entry) => entry.url.endsWith('/canada/ontario'))?.title).toBe('Ontario')
    })

    it('answers nothing for a client with no site domain', async () => {
      // Owning pages it is not yet publishing is a state, not an error.
      const { status, body } = await callSitemap({ prefix: 'free-classes' }, stranger)
      expect(status).toBe(200)
      expect(body).toEqual([])
    })

    it('refuses a prefix Wix would not accept as a page slug', async () => {
      expect((await callSitemap({ prefix: 'Free Classes' })).status).toBe(400)
      expect((await callSitemap({})).status).toBe(400)
    })
  })
})
