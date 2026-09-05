import type { Payload } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { backfillBreadcrumbUrls } from '@/lib/atlas/backfillBreadcrumbUrls'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

/**
 * The `breadcrumbs[].url` backfill (#634).
 *
 * `generateURL` populates that column only on write, so enabling it leaves
 * every pre-existing row null — and the
 * `where[breadcrumbs.url][equals]='/nl/amsterdam'` lookup resolves nothing
 * until this has run.
 *
 * The routine lives in `src/lib/atlas/` rather than in the script precisely so
 * it can be exercised here. The CLI wrapper is argument parsing and printing.
 */
describe('breadcrumb URL backfill', () => {
  let payload: Payload
  let cleanup: () => Promise<void>

  let uk: number
  let england: number
  let london: number
  let france: number

  const createRegion = (slug: string, level: string, parent?: number): Promise<number> =>
    testData.createRegionNode(payload, { prefix: 'bf', slug, level, parent })

  /** Null every stored breadcrumb URL, simulating rows written before #634. */
  const clearBreadcrumbUrls = async (): Promise<void> => {
    const { docs } = await payload.find({
      collection: 'regions',
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { breadcrumbs: true },
    })
    for (const doc of docs) {
      const stripped = (doc.breadcrumbs ?? []).map((crumb) => ({ ...crumb, url: null }))
      // Straight through the DB adapter: an ordinary `update` would re-run the
      // plugin hook and immediately repopulate what we are trying to clear.
      await payload.db.updateOne({
        collection: 'regions',
        id: doc.id,
        data: { breadcrumbs: stripped },
      })
    }
  }

  const urlsFor = async (id: number): Promise<Array<string | null | undefined>> => {
    const doc = await payload.findByID({
      collection: 'regions',
      id,
      depth: 0,
      overrideAccess: true,
    })
    return (doc.breadcrumbs ?? []).map((crumb) => crumb.url)
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup

    uk = await createRegion('uk', 'country')
    england = await createRegion('england', 'region', uk)
    london = await createRegion('london', 'city', england)
    france = await createRegion('france', 'country')
  })

  afterAll(async () => {
    await cleanup()
  })

  it('reports what is missing without writing anything on a dry run', async () => {
    await clearBreadcrumbUrls()

    const stats = await backfillBreadcrumbUrls({ payload, apply: false })
    expect(stats.scanned).toBe(4)
    expect(stats.missing).toBe(4)
    // Two roots (uk, france) would be re-saved. The cascade covers the rest.
    expect(stats.resaved).toBe(2)
    expect(stats.failed).toBe(0)

    // Nothing was written.
    expect(await urlsFor(london)).toEqual([null, null, null])
  })

  it('repopulates the whole tree from a roots-only resave', async () => {
    const stats = await backfillBreadcrumbUrls({ payload, apply: true })

    expect(stats.failed).toBe(0)
    expect(stats.remaining).toBe(0)

    // The deepest node proves the cascade reached three levels down, and that
    // each crumb carries its own ancestor's path — not just the leaf's.
    expect(await urlsFor(london)).toEqual(['/uk', '/uk/england', '/uk/england/london'])
    expect(await urlsFor(england)).toEqual(['/uk', '/uk/england'])
    expect(await urlsFor(france)).toEqual(['/france'])
  })

  it('makes the path lookup resolve, which is the whole point', async () => {
    const { docs } = await payload.find({
      collection: 'regions',
      where: { 'breadcrumbs.url': { equals: '/uk/england/london' } },
      depth: 0,
      overrideAccess: true,
    })
    expect(docs.map((doc) => doc.id)).toEqual([london])
  })

  it('is re-runnable — a second pass finds nothing missing', async () => {
    const stats = await backfillBreadcrumbUrls({ payload, apply: true })
    expect(stats.missing).toBe(0)
    expect(stats.remaining).toBe(0)
    expect(stats.failed).toBe(0)
  })

  it('still reaches a region whose parent was deleted', async () => {
    // Starting the cascade from `parent == null` alone is only sufficient
    // because nothing can be left holding a dangling parent id:
    // `regions_parent_id_regions_id_fk` is ON DELETE **set null**, so deleting
    // a parent promotes its children to roots. If that FK ever changed to
    // RESTRICT-and-leave, or the column stopped being nulled, those regions
    // would become unreachable from any root and this backfill would skip them
    // and their whole subtree in silence — so the assumption is pinned here.
    const stranded = await createRegion('stranded', 'region', uk)
    const strandedCity = await createRegion('stranded-city', 'city', stranded)
    await payload.delete({ collection: 'regions', id: uk, overrideAccess: true })

    const promoted = await payload.findByID({
      collection: 'regions',
      id: stranded,
      depth: 0,
      overrideAccess: true,
    })
    expect(promoted.parent).toBeNull()

    await clearBreadcrumbUrls()
    const stats = await backfillBreadcrumbUrls({ payload, apply: true })
    expect(stats.failed).toBe(0)
    expect(stats.remaining).toBe(0)

    // Rebuilt from the promoted region down — the deleted ancestor simply
    // drops out of the chain rather than leaving a gap in it.
    expect(await urlsFor(stranded)).toEqual(['/stranded'])
    expect(await urlsFor(strandedCity)).toEqual(['/stranded', '/stranded/stranded-city'])
  })
})
