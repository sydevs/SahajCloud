import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { atlasSeo } from '@/endpoints/atlas/seo'
import type { AtlasSeoResponse } from '@/endpoints/responseTypes'
import { ATLAS_DEFAULT_LOCALES } from '@/lib/atlas/defaultLocales'
import { serverEnv } from '@/lib/env'
import type { Event } from '@/payload-types'

import { createData, testData, type FixtureOverrides } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * `GET /api/atlas/seo` (#645) — the half that needs a database: resolving a
 * route to a document, reading the canonical rather than rebuilding it, and
 * walking the region tree for breadcrumbs and a descendant-inclusive listing.
 * The pure shaping rules are in `tests/unit/atlas-seo-document.spec.ts`.
 *
 * The tree, built once for the suite:
 *
 *   united-kingdom      ← owned by an atlas client (path routing, mount `/map`)
 *   └─ greater-london       + one event
 *       └─ meeting-hall     + one event   ← a shared venue under the city
 *   france              ← unowned, so it falls back to the We Meditate surface
 *   └─ sandbox-city         ← where cases that create their own class put it
 *
 * Ownership at the country level and a venue under a city are both
 * load-bearing: the first proves the canonical is read per document rather than
 * composed from one base, and the second proves a city's page lists classes
 * held at its venues. `sandbox-city` keeps the UK listing counts independent of
 * which cases have run, so nothing here depends on declaration order.
 */

type TestUser = {
  id: number | string
  collection: string
  _status?: 'published' | 'draft'
  roles?: string[]
} | null

type SeoBody = AtlasSeoResponse & { errors?: { message: string }[] }

// Annotated rather than `as const`: the latter freezes `weekdays` into a
// readonly tuple, which the mutable schema field will not accept.
const SCHEDULE: NonNullable<FixtureOverrides<Event>['schedule']> = {
  firstDate: '2026-01-06T10:00:00.000Z',
  firstDate_tz: 'Europe/London',
  recurrenceType: 'WEEKLY',
  interval: 1,
  weekdays: ['MO'],
}

const OWNER_DOMAIN = 'sahajayoga.org.uk'
const OWNER_MOUNT = '/map'

describe('atlasSeo endpoint', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let client: TestUser
  let managerId: number

  const region: Record<string, number> = {}
  const event: Record<string, number> = {}

  async function callSeo(
    query: Record<string, unknown>,
    user: TestUser = client,
  ): Promise<{ status: number; headers: Headers; body: SeoBody }> {
    const req = {
      payload,
      query,
      headers: new Headers(),
      routeParams: {},
      context: {},
      user,
    } as unknown as PayloadRequest
    const response = (await atlasSeo.handler(req)) as Response
    return { status: response.status, headers: response.headers, body: await response.json() }
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
          mapboxId: `seo-${args.slug}`,
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
            city: 'London',
            country: 'GB',
            latitude: 51.5,
            longitude: -0.12,
          },
          _status: 'published',
          ...overrides,
        }),
      })
      .then((doc) => doc.id)

  const readRegion = (id: number) =>
    payload.findByID({ collection: 'regions', id, depth: 0, overrideAccess: true })

  const readEvent = (id: number) =>
    payload.findByID({ collection: 'events', id, depth: 0, overrideAccess: true })

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const manager = await testData.createManager(payload, {
      name: 'SEO Manager',
      email: 'seo-manager@example.com',
    })
    managerId = manager.id

    region.uk = await createRegion({
      name: 'United Kingdom',
      slug: 'united-kingdom',
      level: 'country',
    })
    region.london = await createRegion({
      name: 'Greater London',
      slug: 'greater-london',
      level: 'city',
      parent: region.uk,
    })
    region.hall = await createRegion({
      name: 'Meeting Hall',
      slug: 'meeting-hall',
      level: 'venue',
      parent: region.london,
    })
    region.france = await createRegion({ name: 'France', slug: 'france', level: 'country' })
    // Somewhere for the cases that create their own class to put it. The
    // region-listing assertions below count what is under `united-kingdom`, so
    // a case adding a class there would couple those assertions to file order.
    region.sandbox = await createRegion({
      name: 'Sandbox City',
      slug: 'sandbox-city',
      level: 'city',
      parent: region.france,
    })

    // The host/mount/routing a canonical is built from live in
    // `canonical.verification.verified` — job-written from what the CMS observed
    // on the live page — so both halves have to be set for a client to own
    // anything (#633's trust boundary, consumed by #640).
    await testData.createClient(payload, managerId, {
      name: 'UK Atlas Client',
      roles: ['sahaj-atlas-client'],
      region: region.uk,
      canonical: {
        enabled: true,
        embed: `https://${OWNER_DOMAIN}${OWNER_MOUNT}`,
        verification: {
          verified: {
            domain: OWNER_DOMAIN,
            mount: OWNER_MOUNT,
            routing: 'path',
            widgetVersion: 2,
            at: '2026-08-18T00:00:00.000Z',
          },
          failureCount: 0,
          attempts: [],
        },
      },
      _status: 'published',
    } as never)

    const clientDoc = await testData.createClient(payload, managerId, {
      name: 'Atlas SEO Reader',
      roles: ['sahaj-atlas-client'],
    })
    client = {
      id: clientDoc.id,
      collection: 'clients',
      _status: 'published',
      roles: ['sahaj-atlas-client'],
    }

    event.city = await createEvent({ title: 'City Meditation', region: region.london })
    event.venue = await createEvent({ title: 'Venue Meditation', region: region.hall })
    event.draft = await createEvent({
      title: 'Unpublished Meditation',
      region: region.london,
      _status: 'draft',
    })
    // France stays empty on purpose: it is here only to exercise the unowned
    // fallback, and an event can only attach to a city or a venue anyway.
  })

  afterAll(async () => {
    await cleanup()
  })

  describe('auth gate', () => {
    it.each([
      ['unauthenticated callers', null],
      ['managers', { id: 1, collection: 'managers' }],
      ['unpublished (draft) clients', { id: 1, collection: 'clients', _status: 'draft' as const }],
    ])('rejects %s with 403', async (_label, user) => {
      const { status } = await callSeo({ route: '/united-kingdom' }, user as TestUser)
      expect(status).toBe(403)
    })
  })

  describe('query validation', () => {
    it('requires a route', async () => {
      expect((await callSeo({})).status).toBe(400)
    })

    it('refuses a locale the CMS is not translated into, and names the accepted set', async () => {
      const { status, body } = await callSeo({ route: '/united-kingdom', locale: 'xx' })
      expect(status).toBe(400)
      expect(JSON.stringify(body.errors)).toContain('pt-BR')
    })
  })

  describe('region routes', () => {
    it('resolves a region path in one lookup and answers with its own identity', async () => {
      const { status, body } = await callSeo({ route: '/united-kingdom/greater-london' })
      expect(status).toBe(200)
      expect(body.type).toBe('region')
      expect(body.id).toBe(region.london)
      expect(body.route).toBe('/united-kingdom/greater-london')
      if (body.type !== 'region') throw new Error('expected a region')
      expect(body.content.name).toBe('Greater London')
      expect(body.content.level).toBe('city')
    })

    // The claim the ticket cares about most: the canonical is READ, not rebuilt.
    // A second implementation would be free to disagree with #640's.
    it('returns the region’s own webUrl, byte-identical', async () => {
      const { body } = await callSeo({ route: '/united-kingdom/greater-london' })
      const doc = await readRegion(region.london)
      expect(doc.webUrl).toBe(`https://${OWNER_DOMAIN}${OWNER_MOUNT}/united-kingdom/greater-london`)
      expect(body.canonical).toBe(doc.webUrl)
    })

    it('falls back to the We Meditate surface where no client owns the subtree', async () => {
      const { body } = await callSeo({ route: '/france' })
      expect(body.canonical).toBe(
        `${serverEnv.WEMEDITATE_WEB_URL}${serverEnv.WEMEDITATE_ATLAS_BASE_PATH}/france`,
      )
    })

    // Every rung resolves its own canonical, because ownership is per-subtree.
    // Asserting against each ancestor's own `webUrl` is what stops the two
    // composing the same URL two different ways.
    it('gives each breadcrumb rung that ancestor’s own webUrl', async () => {
      const { body } = await callSeo({ route: '/united-kingdom/greater-london/meeting-hall' })
      expect(body.breadcrumbs.map((rung) => rung.name)).toEqual([
        'United Kingdom',
        'Greater London',
        'Meeting Hall',
      ])
      for (const rung of body.breadcrumbs) {
        const doc = await readRegion(
          rung.name === 'United Kingdom'
            ? region.uk
            : rung.name === 'Greater London'
              ? region.london
              : region.hall,
        )
        expect(rung.url, `breadcrumb ${rung.name}`).toBe(doc.webUrl)
        expect(rung.route).toBe(doc.webPath)
      }
    })

    // Events attach to a city *or* a venue beneath it. A city page that listed
    // only its own would silently hide every class held at a shared venue.
    it('lists classes from the whole subtree, not just the region itself', async () => {
      const { body } = await callSeo({ route: '/united-kingdom/greater-london' })
      if (body.type !== 'region') throw new Error('expected a region')
      expect(body.content.events.map((card) => card.title).sort()).toEqual([
        'City Meditation',
        'Venue Meditation',
      ])
      expect(body.content.eventCount).toBe(2)
    })

    it('never lists an unpublished class', async () => {
      const { body } = await callSeo({ route: '/united-kingdom' })
      if (body.type !== 'region') throw new Error('expected a region')
      expect(body.content.events.map((card) => card.title)).not.toContain('Unpublished Meditation')
    })

    it('links each listed class by its own canonical', async () => {
      const { body } = await callSeo({ route: '/united-kingdom/greater-london' })
      if (body.type !== 'region') throw new Error('expected a region')
      const card = body.content.events.find((row) => row.title === 'Venue Meditation')!
      const doc = await readEvent(event.venue)
      expect(card.url).toBe(doc.webUrl)
      expect(card.route).toBe(doc.webPath)
    })

    // The bug this replaced: `where['breadcrumbs.url'][equals]` matches when ANY
    // breadcrumb element matches, so a city route resolved to a venue two levels
    // beneath it. The slug is the unique key. The trail is not.
    it('resolves the region the route names, not a descendant that shares its trail', async () => {
      const { body } = await callSeo({ route: '/united-kingdom/greater-london' })
      expect(body.id).toBe(region.london)
      expect(body.id).not.toBe(region.hall)
    })

    // Ancestry is the part of a URL that goes stale. A 404 here would drop every
    // inbound link into a restructured subtree. Instead the answer carries the
    // corrected route, which a host can redirect to.
    it('still resolves a region whose ancestry in the URL is wrong', async () => {
      const doc = await readRegion(region.london)
      const { status, body } = await callSeo({ route: '/legacy/chain/greater-london' })
      expect(status).toBe(200)
      expect(body.id).toBe(region.london)
      expect(body.route).toBe(doc.webPath)
      expect(body.canonical).toBe(doc.webUrl)
    })

    it('leaves a region with no description of its own rather than inventing one', async () => {
      const { body } = await callSeo({ route: '/united-kingdom' })
      expect(body.description).toBeNull()
      expect(body.openGraph['og:description']).toBeUndefined()
    })
  })

  describe('event routes', () => {
    it('resolves an event route and returns the event’s own webUrl', async () => {
      const doc = await readEvent(event.city)
      const { status, body } = await callSeo({ route: doc.webPath! })
      expect(status).toBe(200)
      expect(body.type).toBe('event')
      expect(body.id).toBe(event.city)
      expect(body.canonical).toBe(doc.webUrl)
      if (body.type !== 'event') throw new Error('expected an event')
      expect(body.content.title).toBe('City Meditation')
      expect(body.content.schedule.oneLine).toContain('Every week on Monday')
    })

    // The region prefix is ancestry, not identity — the widget resolves an event
    // by id alone, and this has to agree with it or a stale link renders one
    // page's content under another page's canonical.
    it('resolves by id despite a wrong prefix, and answers with the corrected route', async () => {
      const doc = await readEvent(event.city)
      const { status, body } = await callSeo({ route: `/some/legacy/chain/${event.city}` })
      expect(status).toBe(200)
      expect(body.id).toBe(event.city)
      expect(body.route).toBe(doc.webPath)
      expect(body.canonical).toBe(doc.webUrl)
    })

    it('steps over a trailing view segment — the documented registration-embed route', async () => {
      const { status, body } = await callSeo({ route: `/${event.city}/register` })
      expect(status).toBe(200)
      expect(body.id).toBe(event.city)
    })

    // `images` is a relationship whose `url` is itself a virtual field, and the
    // read that populates it runs under the caller's own access — so "og:image
    // is absent" would be a silent failure rather than an error. Assert the
    // whole chain once.
    it('populates og:image from the class’s first image', async () => {
      const image = await testData.createMediaImage(payload, { alt: 'Meditation hall' })
      const id = await createEvent({
        title: 'Illustrated Meditation',
        region: region.sandbox,
        images: [image.id],
      })
      const { body } = await callSeo({ route: `/${id}` })
      if (body.type !== 'event') throw new Error('expected an event')

      expect(body.content.images).toHaveLength(1)
      expect(body.content.images[0].url).toBe(image.url)
      expect(body.openGraph['og:image']).toBe(image.url)
      expect(body.openGraph['og:image:alt']).toBe('Meditation hall')
    })

    // The lead photo is what a social card unfurls, and `images` is an ordered
    // field — so the editor's order has to survive the read. It is not free:
    // the images are fetched with `id in (…)`, which returns rows in database
    // order, and only Payload's own `depth: 1` populate preserves the field's.
    //
    // **Both directions are asserted deliberately.** Whatever the database
    // happens to order by, one of the two cases must disagree with it — so this
    // cannot pass vacuously the way a single fixed ordering can. The first
    // version of this test did exactly that: it stayed green with the
    // reordering deleted.
    it.each([
      ['ascending', (low: number, high: number) => [low, high]],
      ['descending', (low: number, high: number) => [high, low]],
    ])(
      'keeps the editor’s image order (%s), so og:image is the lead photo',
      async (label, order) => {
        const alpha = await testData.createMediaImage(payload, { alt: `Alpha ${label}` })
        const beta = await testData.createMediaImage(payload, { alt: `Beta ${label}` })
        expect(beta.id).toBeGreaterThan(alpha.id)

        const chosen = order(alpha.id, beta.id)
        const id = await createEvent({
          title: `Two-Photo Meditation ${label}`,
          region: region.sandbox,
          images: chosen,
        })

        const { body } = await callSeo({ route: `/${id}` })
        if (body.type !== 'event') throw new Error('expected an event')
        const expected = chosen.map((imageId) => (imageId === alpha.id ? alpha.url : beta.url))
        expect(body.content.images.map((image) => image.url)).toEqual(expected)
        expect(body.openGraph['og:image']).toBe(expected[0])
      },
    )

    it('closes the breadcrumb trail with the event itself', async () => {
      const doc = await readEvent(event.city)
      const { body } = await callSeo({ route: doc.webPath! })
      expect(body.breadcrumbs.map((rung) => rung.name)).toEqual([
        'United Kingdom',
        'Greater London',
        'City Meditation',
      ])
      expect(body.breadcrumbs.at(-1)?.url).toBe(doc.webUrl)
    })
  })

  describe('routes that resolve to nothing', () => {
    it.each([
      ['an unknown region slug', '/atlantis'],
      ['an event id that does not exist', '/99999'],
      ['the atlas root', '/'],
      ['a bare view route', '/search'],
    ])('answers 404 for %s', async (_label, route) => {
      const { status, body } = await callSeo({ route })
      expect(status).toBe(404)
      expect(body.errors?.[0]?.message).toContain('does not name')
    })

    it('answers 404 for an unpublished event, the same as for a missing one', async () => {
      // A draft has no public page, so "not published" and "not there" are the
      // same answer to a caller — and neither is a 500.
      expect((await callSeo({ route: `/${event.draft}` })).status).toBe(404)
    })
  })

  describe('the head payload', () => {
    it('emits the widget’s ten locales plus an x-default pointing at the canonical', async () => {
      const { body } = await callSeo({ route: '/united-kingdom' })
      expect(body.alternates).toHaveLength(11)
      expect(body.alternates.at(-1)).toEqual({ hreflang: 'x-default', href: body.canonical })
      expect(body.alternates.find((row) => row.hreflang === 'fr')?.href).toBe(
        `${body.canonical}?locale=fr`,
      )
    })

    // Isolated: these mutate a global every other case reads, so the set is
    // restored afterwards rather than left for whatever runs next to inherit.
    describe('operator-configured locales', () => {
      // The field stores `{ code }` rows, not bare strings — see the global's
      // own comment for why it is an array, and why it is named `languages`.
      //
      // Only non-empty sets are writable here: the field is `required` with
      // `minRows: 1`, so Payload rejects `[]` with a ValidationError. The
      // unconfigured-column fallback is therefore covered in
      // `tests/unit/atlas-locales.spec.ts`, against the pure normalizer.
      const setLocales = (locales: string[]) =>
        payload.updateGlobal({
          slug: 'sy-atlas-config',
          data: { languages: locales.map((code) => ({ code })) } as never,
          overrideAccess: true,
        })

      afterAll(async () => {
        await setLocales([...ATLAS_DEFAULT_LOCALES])
      })

      // The whole point of moving the list onto the global: an operator turning a
      // language off has to stop us telling crawlers that language has a page.
      it('takes its hreflang set from the sy-atlas-config global, live', async () => {
        await setLocales(['fr', 'nl'])
        const narrowed = await callSeo({ route: '/united-kingdom' })
        expect(narrowed.body.alternates.map((row) => row.hreflang)).toEqual([
          'fr',
          'nl',
          'x-default',
        ])

        await setLocales(['fr', 'nl', 'de'])
        const widened = await callSeo({ route: '/united-kingdom' })
        expect(widened.body.alternates.map((row) => row.hreflang)).toEqual([
          'fr',
          'nl',
          'de',
          'x-default',
        ])
      })
    })

    it('keeps the canonical locale-free whatever locale was asked for', async () => {
      const en = await callSeo({ route: '/united-kingdom' })
      const fr = await callSeo({ route: '/united-kingdom', locale: 'fr' })
      expect(fr.body.canonical).toBe(en.body.canonical)
      expect(fr.body.locale).toBe('fr')
      expect(fr.body.openGraph['og:locale']).toBe('fr')
    })

    it('serves JSON-LD that parses, with the region and its trail in one graph', async () => {
      const { body } = await callSeo({ route: '/united-kingdom/greater-london' })
      const graph = JSON.parse(body.jsonLd) as { '@graph': { '@type': string }[] }
      expect(graph['@graph'].map((node) => node['@type'])).toEqual([
        'City',
        'BreadcrumbList',
        'ItemList',
      ])
    })

    it('sets the public read cache headers', async () => {
      const { headers } = await callSeo({ route: '/united-kingdom' })
      expect(headers.get('Cache-Control')).toContain('s-maxage=300')
    })
  })

  // A count assertion rather than a timing one: the whole endpoint leans on the
  // per-request memoization in regionTree/regionOwners, and losing it would show
  // up as one extra `clients` read per breadcrumb rung — slower, still correct,
  // and invisible to every other test here.
  describe('query budget', () => {
    const countFinds = async <T>(operation: () => Promise<T>): Promise<Record<string, number>> => {
      const counts: Record<string, number> = {}
      const original = payload.find.bind(payload)
      const spy = vi.spyOn(payload, 'find').mockImplementation(((args: never) => {
        const slug = String((args as { collection: string }).collection)
        counts[slug] = (counts[slug] ?? 0) + 1
        return original(args)
      }) as typeof payload.find)
      try {
        await operation()
      } finally {
        spy.mockRestore()
      }
      return counts
    }

    it('costs one regions read and one clients read for an event route', async () => {
      const doc = await readEvent(event.venue)
      // A venue's trail is three rungs deep, so an unmemoized ownership walk
      // would be three `clients` reads rather than one — and a `depth: 1` event
      // read would add a second `regions` read to populate a relationship this
      // handler reduces to an id.
      expect(doc.webPath!.split('/').filter(Boolean)).toHaveLength(4)
      const counts = await countFinds(() => callSeo({ route: doc.webPath! }))
      expect(counts).toEqual({ regions: 1, clients: 1 })
    })

    // The common case: most classes have no photos, so they should pay nothing
    // for the images the endpoint is willing to serve.
    it('reads images only when the class actually has some', async () => {
      const image = await testData.createMediaImage(payload, { alt: 'Hall' })
      const withPhoto = await createEvent({
        title: 'Photographed Meditation',
        region: region.sandbox,
        images: [image.id],
      })
      const without = await readEvent(event.city)

      expect(await countFinds(() => callSeo({ route: without.webPath! }))).not.toHaveProperty(
        'images',
      )
      expect(await countFinds(() => callSeo({ route: `/${withPhoto}` }))).toMatchObject({
        images: 1,
      })
    })

    it('adds exactly one events read for a region route', async () => {
      const counts = await countFinds(() => callSeo({ route: '/united-kingdom' }))
      expect(counts).toEqual({ regions: 2, clients: 1, events: 1 })
    })
  })

  // End-to-end version of the unit escaping tests: the value comes out of the
  // database and through the whole handler, since that is the path a hostile
  // string would actually take into somebody else's page.
  describe('script-breakout safety', () => {
    it('leaves no `</script` in the JSON-LD for a class titled with one', async () => {
      const id = await createEvent({
        title: 'Meditation </script><script>alert(1)</script>',
        region: region.sandbox,
      })
      const { status, body } = await callSeo({ route: `/${id}` })

      expect(status).toBe(200)
      expect(body.jsonLd).not.toContain('</script')
      expect(body.jsonLd).not.toContain('<')
      // …and the title itself is untouched: this is an encoding change, so the
      // block still parses back to exactly what the manager typed.
      const graph = JSON.parse(body.jsonLd) as { '@graph': { name?: string }[] }
      expect(graph['@graph'][0].name).toBe('Meditation </script><script>alert(1)</script>')
    })
  })
})
