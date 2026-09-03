import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { serverEnv } from '@/lib/env'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Per-region canonical `webUrl` resolution (#634).
 *
 * `webUrl` used to be `SAHAJATLAS_URL + webPath` for every document — one
 * global base, pointing at a host that is `noindex` on three layers. It now
 * resolves to the client that owns the region (or the nearest owning ancestor),
 * falling back to the We Meditate surface.
 *
 * The tree, built once for the suite:
 *
 *   uk                 ← owned by clientUk    (query routing, mount `/classes/`)
 *   ├─ england
 *   │   ├─ greater-london  ← owned by clientLondon (path routing, mount `/map`)
 *   │   │   └─ camden          + one event
 *   │   └─ yorkshire           + one event      → inherits clientUk
 *   france             ← a *disabled* client points here
 *       └─ paris               + one event      → We Meditate fallback
 *
 * Two owners at different depths is the point: it proves nearest-ancestor
 * precedence rather than "some owner was found".
 */
describe('per-region canonical webUrl', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let managerId: number

  const region: Record<string, number> = {}
  const event: Record<string, number> = {}

  const UK_DOMAIN = 'sahajayoga.org.uk'
  const LONDON_DOMAIN = 'sahajayogalondon.co.uk'
  const FALLBACK_DOMAIN = 'wemeditate.test'
  const WEMEDITATE_BASE = `${serverEnv.WEMEDITATE_WEB_URL}${serverEnv.WEMEDITATE_ATLAS_BASE_PATH}`

  const createRegion = (slug: string, level: string, parent?: number): Promise<number> =>
    testData.createRegionNode(payload, { prefix: 'mb', slug, level, parent })

  /**
   * Seed a client that owns a region.
   *
   * The host/mount/routing a canonical URL is built from live in
   * `canonical.verification.verified` — job-written from what the CMS observed
   * on the live page — not in the declaration. `canonical.embed` only nominates
   * which reported mount is the candidate, so both have to be set for a client
   * to actually own anything (#633's trust boundary, consumed by #634).
   */
  const createOwner = async (args: {
    name: string
    region: number
    domain: string
    mount: string
    routing: 'query' | 'path'
    enabled?: boolean
  }): Promise<number> => {
    const { name, region: regionId, domain, mount, routing, enabled = true } = args
    const doc = await testData.createClient(payload, managerId, {
      name,
      roles: ['sahaj-atlas-client'],
      region: regionId,
      canonical: {
        enabled,
        embed: `https://${domain}${mount}`,
        verification: {
          verified: { domain, mount, routing, widgetVersion: 2, at: '2026-08-18T00:00:00.000Z' },
          failureCount: 0,
          attempts: [],
        },
      },
      _status: 'published',
    } as never)
    return doc.id
  }

  const readEvent = (id: number) =>
    payload.findByID({ collection: 'events', id, depth: 0, overrideAccess: true })

  const readRegion = (id: number) =>
    payload.findByID({ collection: 'regions', id, depth: 0, overrideAccess: true })

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    const manager = await testData.createManager(payload, {
      name: 'Canonical URL Manager',
      email: 'canonical-url-manager@example.com',
    })
    managerId = manager.id

    region.uk = await createRegion('uk', 'country')
    region.england = await createRegion('england', 'region', region.uk)
    region.london = await createRegion('greater-london', 'city', region.england)
    region.camden = await createRegion('camden', 'venue', region.london)
    region.yorkshire = await createRegion('yorkshire', 'city', region.england)
    region.france = await createRegion('france', 'country')
    // A city, not a region: Events accept only `city` / `venue` levels.
    region.paris = await createRegion('paris', 'city', region.france)

    for (const [key, regionId] of Object.entries({
      camden: region.camden,
      yorkshire: region.yorkshire,
      paris: region.paris,
    })) {
      const created = await testData.createEvent(payload, {
        title: `Event in ${key}`,
        manager: managerId,
        region: regionId,
        _status: 'published',
      } as never)
      event[key] = created.id
    }

    // The UK client owns the whole country, in `query` routing on a page whose
    // path carries a trailing slash.
    await createOwner({
      name: 'Sahaja Yoga UK',
      region: region.uk,
      domain: UK_DOMAIN,
      mount: '/classes/',
      routing: 'query',
    })

    // London owns a sub-tree of it, in `path` routing.
    await createOwner({
      name: 'Sahaja Yoga London',
      region: region.london,
      domain: LONDON_DOMAIN,
      mount: '/map',
      routing: 'path',
    })

    // France has a client with a fully verified embed, but it has not been
    // opted in — so it must own nothing.
    await createOwner({
      name: 'Sahaja Yoga France (not opted in)',
      region: region.france,
      domain: 'sahajayoga.fr',
      mount: '/',
      routing: 'query',
      enabled: false,
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  // ── Ownership resolution ──────────────────────────────────────────────────

  describe('ownership resolution', () => {
    it('resolves an owned region on its owner’s domain, in its routing shape', async () => {
      const uk = await readRegion(region.uk)
      expect(uk.webUrl).toBe(`https://${UK_DOMAIN}/classes/?atlas=/uk`)
    })

    it('extends the owner over a descendant region', async () => {
      const yorkshire = await readRegion(region.yorkshire)
      expect(yorkshire.webUrl).toBe(`https://${UK_DOMAIN}/classes/?atlas=/uk/england/yorkshire`)
    })

    it('resolves an event to the same owner as its region', async () => {
      const yorkshireEvent = await readEvent(event.yorkshire)
      expect(yorkshireEvent.webUrl).toBe(
        `https://${UK_DOMAIN}/classes/?atlas=/uk/england/yorkshire/${event.yorkshire}`,
      )
    })

    it('lets the nearest ancestor win over a more distant one', async () => {
      const london = await readRegion(region.london)
      const camden = await readRegion(region.camden)
      const camdenEvent = await readEvent(event.camden)

      // `path` routing, and the London client — not the UK one above it.
      expect(london.webUrl).toBe(`https://${LONDON_DOMAIN}/map/uk/england/greater-london`)
      expect(camden.webUrl).toBe(`https://${LONDON_DOMAIN}/map/uk/england/greater-london/camden`)
      expect(camdenEvent.webUrl).toBe(
        `https://${LONDON_DOMAIN}/map/uk/england/greater-london/camden/${event.camden}`,
      )
      for (const url of [london.webUrl, camden.webUrl, camdenEvent.webUrl]) {
        expect(url).not.toContain(UK_DOMAIN)
      }
    })

    it('falls back to We Meditate when no ancestor is owned', async () => {
      const paris = await readRegion(region.paris)
      const parisEvent = await readEvent(event.paris)
      expect(paris.webUrl).toBe(`${WEMEDITATE_BASE}/france/paris`)
      expect(parisEvent.webUrl).toBe(`${WEMEDITATE_BASE}/france/paris/${event.paris}`)
    })

    it('never lets a client with canonical.enabled false own anything', async () => {
      const france = await readRegion(region.france)
      expect(france.webUrl).toBe(`${WEMEDITATE_BASE}/france`)
      expect(france.webUrl).not.toContain('sahajayoga.fr')
    })

    it('stops owning as soon as the client is unpublished', async () => {
      const { docs } = await payload.find({
        collection: 'clients',
        where: { name: { equals: 'Sahaja Yoga London' } },
        limit: 1,
        overrideAccess: true,
      })
      const londonClient = docs[0]
      await payload.update({
        collection: 'clients',
        id: londonClient.id,
        data: { _status: 'draft' } as never,
        overrideAccess: true,
      })

      // Falls through to the UK client one level up, not to We Meditate.
      const london = await readRegion(region.london)
      expect(london.webUrl).toBe(`https://${UK_DOMAIN}/classes/?atlas=/uk/england/greater-london`)

      await payload.update({
        collection: 'clients',
        id: londonClient.id,
        data: { _status: 'published' } as never,
        overrideAccess: true,
      })
      expect((await readRegion(region.london)).webUrl).toContain(LONDON_DOMAIN)
    })

    /**
     * The verification column is written by the VerifyEmbeds job with a raw
     * `pool.query`, so Payload's JSON-schema validation of `domain` never runs
     * on that write — and `splitMountKey` records `url.host`, which keeps a
     * port that `allowedDomains` (port-stripped) would have let through.
     *
     * A canonical URL naming a port nobody chose is not one we publish. The
     * region must fall through as though it had no owner.
     */
    it('refuses a verified host that is not a bare host, and falls through', async () => {
      const { docs } = await payload.find({
        collection: 'clients',
        where: { name: { equals: 'Sahaja Yoga London' } },
        limit: 1,
        overrideAccess: true,
      })
      const londonClient = docs[0]
      // Written the way the job writes it — a raw UPDATE, which is exactly why
      // the JSON schema's domain check never runs on this path. Going through
      // `payload.update` here would be rejected by that schema and would prove
      // nothing about the state the job can actually leave behind.
      const db = payload.db as unknown as {
        pool?: { query: (sql: string, values: unknown[]) => Promise<unknown> }
        schemaName?: string
      }
      const verified = {
        verified: {
          domain: `${LONDON_DOMAIN}:8080`,
          mount: '/map',
          routing: 'path',
          widgetVersion: 2,
          at: '2026-08-18T00:00:00.000Z',
        },
        failureCount: 0,
        attempts: [],
      }
      await db.pool!.query(
        `UPDATE "${db.schemaName ?? 'public'}".clients
           SET canonical_verification = $1::jsonb WHERE id = $2`,
        [JSON.stringify(verified), londonClient.id],
      )

      const london = await readRegion(region.london)
      expect(london.webUrl).not.toContain('8080')
      // Falls through to the UK client one level up — the nearest ancestor that
      // can actually make a canonical URL.
      expect(london.webUrl).toBe(`https://${UK_DOMAIN}/classes/?atlas=/uk/england/greater-london`)
    })
  })

  // ── The contract the whole ticket exists to enforce ───────────────────────

  describe('no response names the noindex Atlas host', () => {
    it('holds across a full read of every event and region', async () => {
      const [events, regions] = await Promise.all([
        payload.find({ collection: 'events', pagination: false, depth: 0, overrideAccess: true }),
        payload.find({ collection: 'regions', pagination: false, depth: 0, overrideAccess: true }),
      ])

      const urls = [...events.docs, ...regions.docs].flatMap((doc) => [
        (doc as { webPath?: string | null }).webPath,
        (doc as { webUrl?: string | null }).webUrl,
      ])
      expect(urls.filter(Boolean).length).toBeGreaterThan(0)

      for (const url of urls) {
        if (!url) continue
        expect(url).not.toContain('sahajatlas')
        expect(url).not.toContain('#!')
        expect(url).not.toContain('#')
      }
    })
  })

  // ── webPath is unchanged by any of this ───────────────────────────────────

  describe('webPath', () => {
    it('is the bare ancestor slug chain, with no base and no owner in it', async () => {
      expect((await readRegion(region.camden)).webPath).toBe('/uk/england/greater-london/camden')
      expect((await readRegion(region.paris)).webPath).toBe('/france/paris')
      expect((await readEvent(event.camden)).webPath).toBe(
        `/uk/england/greater-london/camden/${event.camden}`,
      )
    })

    it('is identical whether or not the region is owned', async () => {
      // Ownership changes only the base — an owned and an unowned region both
      // report the same shape of path.
      const owned = await readRegion(region.yorkshire)
      const unowned = await readRegion(region.paris)
      expect(owned.webPath).toBe('/uk/england/yorkshire')
      expect(unowned.webPath).toBe('/france/paris')
    })
  })

  // ── Publish gating is untouched ───────────────────────────────────────────

  describe('publish gating', () => {
    it('reads null for both fields on an unpublished event', async () => {
      const draft = await testData.createEvent(payload, {
        title: 'Unpublished event',
        manager: managerId,
        region: region.camden,
        _status: 'draft',
      } as never)

      const read = await readEvent(draft.id)
      expect(read.webPath).toBeNull()
      expect(read.webUrl).toBeNull()
    })

    it('still exposes both on a region, which has no _status', async () => {
      const france = await readRegion(region.france)
      expect(france.webPath).toBe('/france')
      expect(france.webUrl).toBeTruthy()
    })
  })

  // ── Cost ──────────────────────────────────────────────────────────────────

  describe('query cost', () => {
    /**
     * Count `find` calls per collection across one operation.
     *
     * Counting calls rather than timing anything: the guarantee is "two queries
     * whatever N is", which a timing assertion could satisfy by accident on a
     * fast local database.
     */
    const countFinds = async <T>(
      operation: () => Promise<T>,
    ): Promise<{ counts: Record<string, number>; result: T }> => {
      const counts: Record<string, number> = {}
      const original = payload.find.bind(payload)
      const spy = vi.spyOn(payload, 'find').mockImplementation(((args: never) => {
        const slug = String((args as { collection: string }).collection)
        counts[slug] = (counts[slug] ?? 0) + 1
        return original(args)
      }) as typeof payload.find)
      let result: T
      try {
        result = await operation()
      } finally {
        spy.mockRestore()
      }
      return { counts, result }
    }

    it('resolves N events with exactly two extra queries, independent of N', async () => {
      const readEvents = (limit: number) => () =>
        payload.find({
          collection: 'events',
          limit,
          depth: 0,
          overrideAccess: true,
          // Published only: an unpublished event short-circuits before the
          // resolver runs, so a draft in the result set would make this pass by
          // resolving nothing at all.
          where: { _status: { equals: 'published' } },
          select: { webUrl: true } as never,
        })

      const one = await countFinds(readEvents(1))
      const many = await countFinds(readEvents(3))

      // One `regions` query for the tree, one `clients` query for ownership —
      // memoized on the request, so the count does not move with the number of
      // documents being resolved.
      expect(one.counts.regions).toBe(1)
      expect(one.counts.clients).toBe(1)
      expect(many.counts.regions).toBe(1)
      expect(many.counts.clients).toBe(1)

      // …and every document actually resolved one. Counting queries alone would
      // pass just as happily if the resolver returned null for all of them,
      // which is the cheapest possible way to issue two queries.
      // `select` is cast to `never` above (it names virtual fields), so the docs
      // come back untyped — narrow to just what is asserted.
      const resolved = many.result.docs as Array<{ webUrl?: string | null }>
      expect(resolved.length).toBeGreaterThan(1)
      for (const doc of resolved) {
        expect(doc.webUrl).toMatch(/^https?:\/\//)
      }
    })

    it('does not resolve ownership at all for a webPath-only read', async () => {
      // The widget's geojson feed selects `webPath` and not `webUrl`; it should
      // keep paying for one query, not two.
      const { counts, result } = await countFinds(() =>
        payload.find({
          collection: 'events',
          limit: 3,
          depth: 0,
          overrideAccess: true,
          where: { _status: { equals: 'published' } },
          select: { webPath: true } as never,
        }),
      )
      expect(counts.regions).toBe(1)
      expect(counts.clients ?? 0).toBe(0)
      // Paths still resolved — the saving is the ownership query, not the work.
      for (const doc of result.docs as Array<{ webPath?: string | null }>) {
        expect(doc.webPath).toMatch(/^\//)
      }
    })

    /**
     * The cost a canonical fallback client adds (#652), and where it lands.
     *
     * `sy-atlas-config` backs no other read on this path, so naming a fallback
     * client genuinely adds queries where there were none: the global, then the
     * row it names. Both are memoized on the request, so the guarantee is the
     * same shape as the case above — a fixed number per **request**, never per
     * document.
     *
     * Read against `paris`, the region nothing owns, because an owned region
     * short-circuits before the question is asked — which is also why the two
     * cases above still count one `clients` query rather than two.
     */
    it('costs one more clients query per request with a fallback client, whatever N', async () => {
      // A fresh owner rather than one of the two above: the invalid-host case
      // rewrites London's verified domain in place with a raw UPDATE, so reusing
      // it here would make this test's subject depend on whether that case ran.
      region.spain = await createRegion('spain', 'country')
      const fallbackId = await createOwner({
        name: 'We Meditate (fallback)',
        region: region.spain,
        domain: FALLBACK_DOMAIN,
        mount: '/map',
        routing: 'path',
      })

      // Two more unowned classes, so N genuinely varies on the unowned path.
      for (const suffix of ['b', 'c']) {
        await testData.createEvent(payload, {
          title: `Event in paris ${suffix}`,
          manager: managerId,
          region: region.paris,
          _status: 'published',
        } as never)
      }

      const setFallback = (id: number | null) =>
        payload.updateGlobal({
          slug: 'sy-atlas-config',
          data: { canonicalFallbackClient: id } as never,
          overrideAccess: true,
        })

      await setFallback(Number(fallbackId))
      try {

        const readParis = (limit: number) => () =>
          payload.find({
            collection: 'events',
            limit,
            depth: 0,
            overrideAccess: true,
            where: {
              and: [{ region: { equals: region.paris } }, { _status: { equals: 'published' } }],
            },
            select: { webUrl: true } as never,
          })

        const one = await countFinds(readParis(1))
        const many = await countFinds(readParis(3))

        // One `regions` query for the tree; two `clients` queries — ownership,
        // then the fallback row — and neither moves with the document count.
        expect(one.counts.regions).toBe(1)
        expect(one.counts.clients).toBe(2)
        expect(many.counts.regions).toBe(1)
        expect(many.counts.clients).toBe(2)

        // …and every document resolved onto the fallback's host, so the counts
        // are not cheap because nothing was resolved.
        const resolved = many.result.docs as Array<{ webUrl?: string | null }>
        expect(resolved.length).toBeGreaterThan(1)
        for (const doc of resolved) expect(doc.webUrl).toContain(FALLBACK_DOMAIN)

        // Precedence, asserted where it actually lives. `canonicalTargetFor`
        // takes one owner and knows nothing about rank; what makes an owned
        // region immune to the fallback is that `getCanonicalUrlBase` returns
        // before resolving one. So this reads an OWNED region with the fallback
        // still configured and asserts both halves: the owner's host answers,
        // and the fallback was never queried — `clients` stays at 1, not 2.
        const owned = await countFinds(() =>
          payload.find({
            collection: 'regions',
            limit: 1,
            depth: 0,
            overrideAccess: true,
            where: { id: { equals: region.uk } },
            select: { webUrl: true } as never,
          }),
        )
        const ukDoc = owned.result.docs[0] as { webUrl?: string | null }
        expect(ukDoc.webUrl).toBe(`https://${UK_DOMAIN}/classes/?atlas=/uk`)
        expect(ukDoc.webUrl).not.toContain(FALLBACK_DOMAIN)
        expect(owned.counts.clients).toBe(1)
      } finally {
        await setFallback(null)
      }
    })
  })

  // ── The path lookup this unlocks ──────────────────────────────────────────

  describe('breadcrumbs.url lookup', () => {
    it('resolves a region path in one query', async () => {
      const { docs } = await payload.find({
        collection: 'regions',
        where: { 'breadcrumbs.url': { equals: '/uk/england/greater-london' } },
        depth: 0,
        overrideAccess: true,
      })
      expect(docs.map((doc) => doc.id)).toContain(region.london)
    })

    it('also matches descendants, because the path is in their trail too', async () => {
      // Worth pinning: `breadcrumbs` is an array, so `equals` matches a document
      // when *any* crumb carries that URL — and every descendant's trail
      // contains its ancestors'. A caller wanting exactly one region must say so.
      const { docs } = await payload.find({
        collection: 'regions',
        where: { 'breadcrumbs.url': { equals: '/uk/england/greater-london' } },
        depth: 0,
        overrideAccess: true,
      })
      expect(docs.map((doc) => doc.id).sort()).toEqual([region.london, region.camden].sort())
    })

    it('resolves exactly one region when the tail slug is named too', async () => {
      const { docs } = await payload.find({
        collection: 'regions',
        where: {
          and: [
            { 'breadcrumbs.url': { equals: '/uk/england/greater-london' } },
            { slug: { equals: 'greater-london' } },
          ],
        },
        depth: 0,
        overrideAccess: true,
      })
      expect(docs).toHaveLength(1)
      expect(docs[0].id).toBe(region.london)
    })

    it('stores the full chain, one URL per ancestor', async () => {
      const camden = await readRegion(region.camden)
      const urls = (camden.breadcrumbs ?? []).map((crumb) => crumb.url)
      expect(urls).toEqual([
        '/uk',
        '/uk/england',
        '/uk/england/greater-london',
        '/uk/england/greater-london/camden',
      ])
    })
  })

  // ── The slug invariant ────────────────────────────────────────────────────

  describe('non-empty slug invariant', () => {
    it('rejects a create with a blank slug', async () => {
      await expect(
        payload.create({
          collection: 'regions',
          overrideAccess: true,
          data: { name: '', slug: '', level: 'country', mapboxId: 'mb-blank' } as never,
        }),
      ).rejects.toThrow()
    })

    it('rejects clearing the slug on an existing region', async () => {
      await expect(
        payload.update({
          collection: 'regions',
          id: region.yorkshire,
          overrideAccess: true,
          data: { slug: '   ' } as never,
        }),
      ).rejects.toThrow()
    })

    it('leaves an update that does not mention the slug alone', async () => {
      const updated = await payload.update({
        collection: 'regions',
        id: region.yorkshire,
        overrideAccess: true,
        data: { name: 'Yorkshire' } as never,
      })
      expect(updated.slug).toBe('yorkshire')
    })
  })
})
