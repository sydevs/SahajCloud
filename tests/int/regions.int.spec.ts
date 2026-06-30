import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestEnvironment } from '../utils/testHelpers'

/**
 * Recursive-descendant coverage for the Regions child-join tabs
 * (childrenRegions / childrenCities / childrenCenters).
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
 *   │       └─ centerA
 *   └─ regionB
 *       └─ cityB
 *
 * The two region branches prove scoping (regionA's tab must not see cityB) on
 * top of recursion (countryA's tab must see the 2-hop cityA / 3-hop centerA).
 */
describe('Regions child-join recursive descendants', () => {
  let payload: Payload
  let cleanup: (() => Promise<void>) | undefined

  let countryA: number
  let regionA: number
  let regionB: number
  let cityA: number
  let cityB: number
  let centerA: number

  type ChildJoinField = 'childrenRegions' | 'childrenCities' | 'childrenCenters'

  /** Descendant ids from a child join, shape-agnostic (depth 0 ids or populated docs). */
  const joinIds = (doc: Record<string, unknown>, field: ChildJoinField): number[] => {
    const join = doc[field] as { docs?: (number | { id: number })[] } | undefined
    return (join?.docs ?? []).map((entry) => (typeof entry === 'number' ? entry : entry.id))
  }

  const createRegion = async (data: {
    name: string
    level: 'country' | 'region' | 'city' | 'center'
    mapboxId: string
    parent?: number
  }): Promise<number> => {
    const region = await payload.create({ collection: 'regions', overrideAccess: true, data })
    return region.id
  }

  const readRegion = (id: number, locale?: 'en' | 'cs'): Promise<Record<string, unknown>> =>
    payload.findByID({ collection: 'regions', id, depth: 0, locale }) as Promise<
      Record<string, unknown>
    >

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
    centerA = await createRegion({
      name: 'Center A',
      level: 'center',
      mapboxId: 'rd.centerA',
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

    it('lists centers at any depth (3 hops down)', async () => {
      const country = await readRegion(countryA)
      expect(joinIds(country, 'childrenCenters')).toEqual([centerA])
    })

    it('never lists itself in any child tab', async () => {
      const country = await readRegion(countryA)
      expect(joinIds(country, 'childrenRegions')).not.toContain(countryA)
      expect(joinIds(country, 'childrenCities')).not.toContain(countryA)
      expect(joinIds(country, 'childrenCenters')).not.toContain(countryA)
    })
  })

  describe('from a Region (scoping to its own subtree)', () => {
    it('lists only the cities beneath it — not a sibling region’s city', async () => {
      const region = await readRegion(regionA)
      expect(joinIds(region, 'childrenCities')).toEqual([cityA])
    })

    it('lists centers beneath its cities (2 hops down)', async () => {
      const region = await readRegion(regionA)
      expect(joinIds(region, 'childrenCenters')).toEqual([centerA])
    })

    it('shows an empty centers tab when the subtree has none', async () => {
      const region = await readRegion(regionB)
      expect(joinIds(region, 'childrenCities')).toEqual([cityB])
      expect(joinIds(region, 'childrenCenters')).toEqual([])
    })
  })

  describe('from a City', () => {
    it('lists its direct centers', async () => {
      const city = await readRegion(cityA)
      expect(joinIds(city, 'childrenCenters')).toEqual([centerA])
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
      expect(joinIds(cs, 'childrenCenters').sort()).toEqual(joinIds(en, 'childrenCenters').sort())
      // And the set is genuinely non-empty (guards against "both empty" passing).
      expect(joinIds(cs, 'childrenCities').sort()).toEqual([cityA, cityB].sort())
    })
  })
})
