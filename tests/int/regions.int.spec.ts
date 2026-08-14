import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { serverEnv } from '@/lib/env'
import type { Region } from '@/payload-types'


import { createData, type FixtureOverrides } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Recursive-descendant coverage for the Regions child-join tabs
 * (childrenRegions / childrenCities / childrenVenues).
 *
 * These joins are defined `on: 'breadcrumbs.doc'` (the denormalized nested-docs
 * ancestor path), not `on: 'parent'`, so each tab must list every descendant at
 * its level — at any depth — rather than only direct children. The per-level
 * `where` filter both scopes a tab to one level and excludes the node itself.
 *
 * Tree built once for the whole suite:
 *
 *   countryA
 *   ├─ regionA
 *   │   └─ cityA
 *   │       └─ venueA
 *   └─ regionB
 *       └─ cityB
 *
 * The two region branches prove scoping (regionA's tab must not see cityB) on
 * top of recursion (countryA's tab must see the 2-hop cityA / 3-hop venueA).
 */
describe('Regions child-join recursive descendants', () => {
  let payload: Payload
  let cleanup: (() => Promise<void>) | undefined

  let countryA: number
  let regionA: number
  let regionB: number
  let cityA: number
  let cityB: number
  let venueA: number

  type ChildJoinField = 'childrenRegions' | 'childrenCities' | 'childrenVenues'

  /** Descendant ids from a child join, shape-agnostic (depth 0 ids or populated docs). */
  const joinIds = (doc: Region, field: ChildJoinField): number[] => {
    const join = doc[field] as { docs?: (number | { id: number })[] } | undefined
    return (join?.docs ?? []).map((entry) => (typeof entry === 'number' ? entry : entry.id))
  }

  const createRegion = async (data: FixtureOverrides<Region>): Promise<number> => {
    const region = await payload.create({
      collection: 'regions',
      overrideAccess: true,
      data: createData<'regions'>(data),
    })
    return region.id
  }

  const readRegion = (id: number, locale?: 'en' | 'cs'): Promise<Region> =>
    payload.findByID({ collection: 'regions', id, depth: 0, locale })

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    countryA = await createRegion({ name: 'Country A', level: 'country', mapboxId: 'rd.countryA' })
    regionA = await createRegion({
      name: 'Region A',
      level: 'region',
      mapboxId: 'rd.regionA',
      parent: countryA,
    })
    regionB = await createRegion({
      name: 'Region B',
      level: 'region',
      mapboxId: 'rd.regionB',
      parent: countryA,
    })
    cityA = await createRegion({
      name: 'City A',
      level: 'city',
      mapboxId: 'rd.cityA',
      parent: regionA,
    })
    cityB = await createRegion({
      name: 'City B',
      level: 'city',
      mapboxId: 'rd.cityB',
      parent: regionB,
    })
    venueA = await createRegion({
      name: 'Venue A',
      level: 'venue',
      mapboxId: 'rd.venueA',
      parent: cityA,
    })
  })

  afterAll(async () => {
    await cleanup?.()
  })

  describe('from a Country (the tree root)', () => {
    it('lists every region-level descendant', async () => {
      const country = await readRegion(countryA)
      expect(joinIds(country, 'childrenRegions').sort()).toEqual([regionA, regionB].sort())
    })

    it('lists cities at any depth — not just direct children (2 hops down)', async () => {
      const country = await readRegion(countryA)
      // cityA/cityB sit under regions, never directly under the country; an
      // `on: 'parent'` join would miss them entirely.
      expect(joinIds(country, 'childrenCities').sort()).toEqual([cityA, cityB].sort())
    })

    it('lists venues at any depth (3 hops down)', async () => {
      const country = await readRegion(countryA)
      expect(joinIds(country, 'childrenVenues')).toEqual([venueA])
    })

    it('never lists itself in any child tab', async () => {
      const country = await readRegion(countryA)
      expect(joinIds(country, 'childrenRegions')).not.toContain(countryA)
      expect(joinIds(country, 'childrenCities')).not.toContain(countryA)
      expect(joinIds(country, 'childrenVenues')).not.toContain(countryA)
    })
  })

  describe('from a Region (scoping to its own subtree)', () => {
    it('lists only the cities beneath it — not a sibling region’s city', async () => {
      const region = await readRegion(regionA)
      expect(joinIds(region, 'childrenCities')).toEqual([cityA])
    })

    it('lists venues beneath its cities (2 hops down)', async () => {
      const region = await readRegion(regionA)
      expect(joinIds(region, 'childrenVenues')).toEqual([venueA])
    })

    it('shows an empty venues tab when the subtree has none', async () => {
      const region = await readRegion(regionB)
      expect(joinIds(region, 'childrenCities')).toEqual([cityB])
      expect(joinIds(region, 'childrenVenues')).toEqual([])
    })
  })

  describe('from a City', () => {
    it('lists its direct venues', async () => {
      const city = await readRegion(cityA)
      expect(joinIds(city, 'childrenVenues')).toEqual([venueA])
    })
  })

  describe('locale independence', () => {
    it('returns the same descendant set in a non-default locale (cs)', async () => {
      // The tree is created in the default locale (en); breadcrumbs are
      // non-localized (see Regions.ts), so the reverse-lookup on `breadcrumbs.doc`
      // is locale-stable — the descendant set a manager sees must not depend on
      // the admin UI locale.
      const en = await readRegion(countryA, 'en')
      const cs = await readRegion(countryA, 'cs')

      expect(joinIds(cs, 'childrenRegions').sort()).toEqual(joinIds(en, 'childrenRegions').sort())
      expect(joinIds(cs, 'childrenCities').sort()).toEqual(joinIds(en, 'childrenCities').sort())
      expect(joinIds(cs, 'childrenVenues').sort()).toEqual(joinIds(en, 'childrenVenues').sort())
      // And the set is genuinely non-empty (guards against "both empty" passing).
      expect(joinIds(cs, 'childrenCities').sort()).toEqual([cityA, cityB].sort())
    })
  })

  // Canonical Atlas web path/URL — the ordered ancestor slug chain (incl. self),
  // built read-time from the breadcrumbs + current slugs.
  describe('canonical webPath / webUrl', () => {
    // A separate country → city pair (no region level) for the region-optional
    // shape and the slug-rename recompute check, kept off the shared tree so it
    // can't disturb the child-join assertions above.
    let countryZ: number
    let cityZ: number

    beforeAll(async () => {
      countryZ = await createRegion({
        name: 'Country Z',
        level: 'country',
        mapboxId: 'wp.countryZ',
      })
      cityZ = await createRegion({
        name: 'City Z',
        level: 'city',
        mapboxId: 'wp.cityZ',
        parent: countryZ,
      })
    })

    it('builds the full ancestor slug chain including the node itself', async () => {
      const [country, region, city, venue] = await Promise.all([
        readRegion(countryA),
        readRegion(regionA),
        readRegion(cityA),
        readRegion(venueA),
      ])
      const c = String(country.slug)
      const r = String(region.slug)
      const ci = String(city.slug)
      expect(country.webPath).toBe(`/${c}`)
      expect(region.webPath).toBe(`/${c}/${r}`)
      expect(city.webPath).toBe(`/${c}/${r}/${ci}`)
      expect(venue.webPath).toBe(`/${c}/${r}/${ci}/${String(venue.slug)}`)
    })

    it('collapses the region-optional shape (a city directly under a country)', async () => {
      const [country, city] = await Promise.all([readRegion(countryZ), readRegion(cityZ)])
      expect(city.webPath).toBe(`/${String(country.slug)}/${String(city.slug)}`)
    })

    it('exposes webUrl as webPath joined to the canonical base for the region', async () => {
      const country = await readRegion(countryA)
      // No client owns this region, so the base is the We Meditate surface
      // (#634). It is deliberately *not* the Atlas host any more — that host is
      // noindex on three layers, so a canonical URL there named a page we had
      // told search engines to ignore.
      const expectedBase = `${serverEnv.WEMEDITATE_WEB_URL}${serverEnv.WEMEDITATE_ATLAS_BASE_PATH}`
      expect(country.webUrl).toBe(`${expectedBase}${String(country.webPath)}`)
      expect(country.webUrl).not.toContain(serverEnv.SAHAJATLAS_URL)
      // appUrl is always emitted but null — there's no Atlas app deep-link base.
      expect(country.appUrl).toBeNull()
    })

    it('reflects an ancestor slug rename on the next read (no stored path)', async () => {
      const before = await readRegion(cityZ)
      await payload.update({
        collection: 'regions',
        id: countryZ,
        overrideAccess: true,
        data: createData<'regions'>({ slug: 'country-z-renamed' }),
      })
      const after = await readRegion(cityZ)
      expect(after.webPath).not.toBe(before.webPath)
      expect(after.webPath).toBe(`/country-z-renamed/${String(after.slug)}`)
    })

    // Country slugs are ISO alpha-2 codes (#556): the atlas seed assigns them on
    // import and the country_slug_iso_code migration rewrites existing rows. The
    // Atlas widget derives each country's code (flags, localized names) from the
    // slug, so the two-letter segment must survive create and flow through every
    // descendant's webPath.
    it('routes an ISO-slugged country through the whole descendant chain', async () => {
      const countryIso = await createRegion({
        name: 'Belgium',
        level: 'country',
        mapboxId: 'wp.countryIso',
        slug: 'be',
      })
      const cityIso = await createRegion({
        name: 'Antwerp',
        level: 'city',
        mapboxId: 'wp.cityIso',
        parent: countryIso,
      })

      const [country, city] = await Promise.all([readRegion(countryIso), readRegion(cityIso)])
      expect(country.slug).toBe('be')
      expect(country.webPath).toBe('/be')
      expect(city.webPath).toBe(`/be/${String(city.slug)}`)
    })
  })
})
