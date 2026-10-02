import { describe, expect, it } from 'vitest'

import { manualMapboxIdFor, regionCreateData } from '@/collections/EventImports/commit/regionData'
import type { ProposedNode } from '@/collections/EventImports/propose/tree'
import { isManualMapboxId } from '@/lib/mapbox/manualLocation'

function node(overrides: Partial<ProposedNode> = {}): ProposedNode {
  return {
    key: 'city:pune',
    level: 'city',
    name: 'Pune',
    parentKey: null,
    match: { kind: 'create' },
    slug: 'pune',
    location: { kind: 'mapbox', mapboxId: 'place.pune' },
    lines: [2],
    ...overrides,
  }
}

describe('regionCreateData', () => {
  it('hands a geocoded node Mapbox’s own id, with no coordinates', () => {
    expect(regionCreateData(node(), 7, 12)).toEqual({
      level: 'city',
      name: 'Pune',
      slug: 'pune',
      parent: 7,
      mapboxId: 'place.pune',
    })
  })

  it('writes a hand-located node’s coordinates and radius', () => {
    const manual = node({
      key: 'state:MH',
      level: 'region',
      name: 'Maharashtra',
      slug: 'maharashtra',
      location: { kind: 'manual', latitude: 19.1, longitude: 73.2, radius: 50_000 },
    })

    const data = regionCreateData(manual, 7, 12)

    expect(data).toMatchObject({ latitude: 19.1, longitude: 73.2, radius: 50_000 })
    expect(isManualMapboxId(data?.mapboxId)).toBe(true)
  })

  /**
   * ⚠ **The assertion the unique constraint depends on.** A commit that died
   * after writing a state and was re-fired must recompute the same id, or the
   * retry writes a second Bavaria under a fresh uuid and splits the batch's
   * classes between two regions.
   */
  it('recomputes the same hand-located id on a second attempt', () => {
    const manual = node({
      location: { kind: 'manual', latitude: 1, longitude: 2, radius: 500 },
    })

    expect(regionCreateData(manual, 7, 12)?.mapboxId).toBe(
      regionCreateData(manual, 7, 12)?.mapboxId,
    )
  })

  it('gives two nodes in one batch different hand-located ids', () => {
    const location = { kind: 'manual' as const, latitude: 1, longitude: 2, radius: 500 }

    expect(manualMapboxIdFor(12, 'state:MH')).not.toBe(manualMapboxIdFor(12, 'state:KA'))
    expect(regionCreateData(node({ key: 'a', location }), 7, 12)?.mapboxId).not.toBe(
      regionCreateData(node({ key: 'b', location }), 7, 12)?.mapboxId,
    )
  })

  it('gives two batches proposing one node different hand-located ids', () => {
    expect(manualMapboxIdFor(12, 'state:MH')).not.toBe(manualMapboxIdFor(13, 'state:MH'))
  })

  it.each([
    [
      'matched to an existing region',
      { match: { kind: 'existing' as const, regionId: 5, name: 'Pune', slug: 'pune' } },
    ],
    [
      'held outside the target',
      { match: { kind: 'elsewhere' as const, regionId: 6, name: 'Pune' } },
    ],
    ['carrying no slug', { slug: null }],
    ['carrying no location', { location: null }],
  ])('creates nothing for a node %s', (_label, overrides) => {
    expect(regionCreateData(node(overrides as Partial<ProposedNode>), 7, 12)).toBeNull()
  })
})
