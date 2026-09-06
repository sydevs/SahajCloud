import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * The grandfather clause's actual purpose (#634).
 *
 * `withNonEmptySlug` lets a **pre-existing** blank slug through on update, and
 * the reason is entirely about the nested-docs cascade: `resaveChildren` fires
 * on every region write and re-saves each descendant by passing its whole
 * existing document back through `update` — blank slug included. Reject that
 * and one bad row makes its whole ancestry unsaveable.
 *
 * 16 regions have a blank name (and so a blank slug) in production today, so
 * this is a live scenario, not a hypothetical. The unit spec covers the
 * validator in isolation. This covers the contract it depends on — that
 * Payload really does supply `previousValue` during a cascade re-save, so the
 * clause fires when it should.
 *
 * Blank-slugged regions are created through `payload.db` directly, because the
 * invariant under test is precisely what stops the normal path creating one.
 */
describe('blank region slug vs the nested-docs cascade', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  let country: number
  let blankRegion: number
  let cityBelow: number

  const createRegion = (slug: string, level: string, parent?: number): Promise<number> =>
    testData.createRegionNode(payload, { prefix: 'bs', slug, level, parent })

  const readRegion = (id: number) =>
    payload.findByID({ collection: 'regions', id, depth: 0, overrideAccess: true })

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    country = await createRegion('rootland', 'country')
    blankRegion = await createRegion('temp-slug', 'region', country)
    cityBelow = await createRegion('city-below', 'city', blankRegion)

    // Bypass the hooks to plant the row shape production actually has: a region
    // whose slug is blank. `payload.update` would (correctly) refuse this.
    await payload.db.updateOne({
      collection: 'regions',
      id: blankRegion,
      data: { slug: '' },
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('planted a genuinely blank slug', async () => {
    // Guards the rest of the suite against passing vacuously — if the direct
    // write stopped working, every assertion below would be meaningless.
    expect((await readRegion(blankRegion)).slug).toBe('')
  })

  it('still lets an ancestor be saved, cascade and all', async () => {
    // This is the whole point. The country's write cascades into the blank
    // region. Without the grandfather clause the validator rejects that child
    // and the plugin turns it into "Could not publish or save changes: One or
    // more children are invalid" — an entire country made unsaveable by one row.
    await expect(
      payload.update({
        collection: 'regions',
        id: country,
        overrideAccess: true,
        data: { name: 'Rootland Renamed' } as never,
      }),
    ).resolves.toMatchObject({ id: country })
  })

  it('leaves the blank slug blank rather than inventing one', async () => {
    expect((await readRegion(blankRegion)).slug).toBe('')
  })

  it('still refuses to give that region a blank slug deliberately', async () => {
    // Grandfathering is about surviving a re-save, not about reopening the
    // door: an explicit write of a blank slug is still refused… and a real
    // slug is still accepted, which is how the row gets fixed.
    await expect(
      payload.update({
        collection: 'regions',
        id: cityBelow,
        overrideAccess: true,
        data: { slug: '' } as never,
      }),
    ).rejects.toThrow()

    const fixed = await payload.update({
      collection: 'regions',
      id: blankRegion,
      overrideAccess: true,
      data: { slug: 'now-named' } as never,
    })
    expect(fixed.slug).toBe('now-named')
  })

  it('restores the whole subtree’s canonical paths once the slug is fixed', async () => {
    // The gap cost this region *and everything under it* their paths. Filling
    // it in brings them all back on the next read, with no backfill.
    const [region, city] = await Promise.all([readRegion(blankRegion), readRegion(cityBelow)])
    expect(region.webPath).toBe('/rootland/now-named')
    expect(city.webPath).toBe('/rootland/now-named/city-below')
  })
})
