import { describe, expect, it } from 'vitest'

import {
  matchNode,
  type ExistingRegion,
  type MatchableNode,
} from '@/collections/EventImports/propose/match'

const TARGET_ID = 10

function region(overrides: Partial<ExistingRegion> & { id: number }): ExistingRegion {
  return {
    level: 'city',
    name: 'Pune',
    slug: 'pune',
    mapboxId: null,
    parentId: TARGET_ID,
    inTarget: true,
    ...overrides,
  }
}

function city(overrides: Partial<MatchableNode> = {}): MatchableNode {
  return { level: 'city', name: 'Pune', mapboxId: null, parentId: TARGET_ID, ...overrides }
}

describe('matchNode', () => {
  it('matches an existing region by its Mapbox id', () => {
    const existing = [region({ id: 7, name: 'Poona', slug: 'poona', mapboxId: 'place.99' })]

    expect(matchNode(city({ mapboxId: 'place.99' }), existing)).toEqual({
      kind: 'existing',
      regionId: 7,
      name: 'Poona',
      slug: 'poona',
    })
  })

  it('refuses a feature managed outside the target instead of matching it', () => {
    const existing = [region({ id: 7, mapboxId: 'place.99', inTarget: false })]

    expect(matchNode(city({ mapboxId: 'place.99' }), existing)).toEqual({
      kind: 'elsewhere',
      regionId: 7,
      name: 'Pune',
    })
  })

  it('prefers the id over a same-named region, so a renamed node still matches itself', () => {
    const existing = [
      region({ id: 7, name: 'Pune', mapboxId: null }),
      region({ id: 8, name: 'Poona', mapboxId: 'place.99' }),
    ]

    const match = matchNode(city({ name: 'Pune', mapboxId: 'place.99' }), existing)

    expect(match).toMatchObject({ kind: 'existing', regionId: 8 })
  })

  it('matches on the name under the same parent, ignoring case and spacing', () => {
    const existing = [region({ id: 7, name: '  NEW   Delhi ' })]

    expect(matchNode(city({ name: 'new delhi' }), existing)).toMatchObject({
      kind: 'existing',
      regionId: 7,
    })
  })

  it('does not match a same-named region under a different parent', () => {
    const existing = [region({ id: 7, parentId: 99 })]

    expect(matchNode(city(), existing)).toEqual({ kind: 'create' })
  })

  it('does not match a same-named region at a different level', () => {
    const existing = [region({ id: 7, level: 'region' })]

    expect(matchNode(city({ level: 'city' }), existing)).toEqual({ kind: 'create' })
  })

  it('does not match a same-named region outside the target', () => {
    const existing = [region({ id: 7, inTarget: false })]

    expect(matchNode(city(), existing)).toEqual({ kind: 'create' })
  })

  it('creates rather than adopting a same-named city when the parent is itself proposed', () => {
    // The state this city hangs under does not exist yet, so there is nothing to
    // be "under the same parent" as.
    //
    // ⚠ **The existing city's parent is null, which is the only shape that could
    // collide.** A fixture naming any other parent passes without the guard
    // too — `null === 42` is false — so it would pin nothing.
    const existing = [region({ id: 7, parentId: null })]

    expect(matchNode(city({ parentId: null }), existing)).toEqual({ kind: 'create' })
  })

  it('creates for a node whose name is only whitespace', () => {
    const existing = [region({ id: 7, name: '   ' })]

    expect(matchNode(city({ name: '  ' }), existing)).toEqual({ kind: 'create' })
  })

  it('falls back to the id when an existing region carries no name', () => {
    const existing = [region({ id: 7, name: null, slug: null, mapboxId: 'place.99' })]

    expect(matchNode(city({ mapboxId: 'place.99' }), existing)).toEqual({
      kind: 'existing',
      regionId: 7,
      name: '7',
      slug: null,
    })
  })
})
