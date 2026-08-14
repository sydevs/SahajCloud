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
  const WEMEDITATE_BASE = `${serverEnv.WEMEDITATE_WEB_URL}${serverEnv.WEMEDITATE_ATLAS_BASE_PATH}`

  const createRegion = async (slug: string, level: string, parent?: number): Promise<number> => {
    const doc = await payload.create({
      collection: 'regions',
      overrideAccess: true,
      data: {
        name: slug,
        slug,
        level,
        mapboxId: `mb-${slug}`,
        ...(parent ? { parent } : {}),
      } as never,
    })
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
    await testData.createClient(payload, managerId, {
      name: 'Sahaja Yoga UK',
      roles: ['sahaj-atlas-client'],
      region: region.uk,
      canonical: { enabled: true, domain: UK_DOMAIN, mount: '/classes/', routing: 'query' },
      _status: 'published',
    } as never)

    // London owns a sub-tree of it, in `path` routing.
    await testData.createClient(payload, managerId, {
      name: 'Sahaja Yoga London',
      roles: ['sahaj-atlas-client'],
      region: region.london,
      canonical: { enabled: true, domain: LONDON_DOMAIN, mount: '/map', routing: 'path' },
      _status: 'published',
    } as never)

    // France has a client, but it has not been opted in.
    await testData.createClient(payload, managerId, {
      name: 'Sahaja Yoga France (not opted in)',
      roles: ['sahaj-atlas-client'],
      region: region.france,
      canonical: { enabled: false, domain: 'sahajayoga.fr', mount: '/', routing: 'query' },
      _status: 'published',
    } as never)
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
      expect(one.regions).toBe(1)
      expect(one.clients).toBe(1)
      expect(many.regions).toBe(1)
      expect(many.clients).toBe(1)
    })

    it('does not resolve ownership at all for a webPath-only read', async () => {
      // The widget's geojson feed selects `webPath` and not `webUrl`; it should
      // keep paying for one query, not two.
      const counts = await countFinds(() =>
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
