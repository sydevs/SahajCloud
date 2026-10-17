import { describe, expect, it } from 'vitest'

import {
  matchNode,
  matchState,
  stateCodeResolver,
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
  return { level: 'city', name: 'Pune', mapboxId: null, ...overrides }
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

  // ⚠ **Anywhere in the subtree, not only under one parent.** A hand-seeded
  // Pune under Maharashtra is the Pune a batch for India proposes straight under
  // the country; a parent-only search proposed a second one beside it.
  it('matches a same-named city anywhere in the target subtree', () => {
    const existing = [
      region({ id: 3, level: 'region', name: 'Maharashtra', parentId: TARGET_ID }),
      region({ id: 7, parentId: 3, mapboxId: 'manual-abc' }),
    ]

    expect(matchNode(city({ subdivisionCode: 'MH' }), existing)).toMatchObject({
      kind: 'existing',
      regionId: 7,
    })
  })

  it('does not match a same-named region at a different level', () => {
    const existing = [region({ id: 7, level: 'region' })]

    expect(matchNode(city({ level: 'city' }), existing)).toEqual({ kind: 'create' })
  })

  it('does not match a same-named region outside the target', () => {
    const existing = [region({ id: 7, inTarget: false })]

    expect(matchNode(city(), existing)).toEqual({ kind: 'create' })
  })

  describe('two same-named cities in different states', () => {
    const states = [
      region({ id: 3, level: 'region', name: 'Illinois', slug: 'illinois', parentId: TARGET_ID }),
      region({ id: 4, level: 'region', name: 'Missouri', slug: 'missouri', parentId: TARGET_ID }),
    ]
    const { subdivisionOf } = stateCodeResolver({
      existing: [region({ id: TARGET_ID, level: 'country', parentId: null }), ...states],
      countryCode: 'US',
      featureCodes: new Map(),
    })
    const springfield = (id: number, parentId: number) =>
      region({ id, name: 'Springfield', slug: `springfield-${id}`, parentId })

    it('never adopts the one in another state', () => {
      const existing = [...states, springfield(20, 4)]

      expect(
        matchNode(city({ name: 'Springfield', subdivisionCode: 'IL' }), existing, { subdivisionOf }),
      ).toEqual({ kind: 'create' })
    })

    it('takes the one in its own state when the other is elsewhere', () => {
      const existing = [...states, springfield(20, 4), springfield(21, 3)]

      expect(
        matchNode(city({ name: 'Springfield', subdivisionCode: 'IL' }), existing, { subdivisionOf }),
      ).toMatchObject({ kind: 'existing', regionId: 21 })
    })

    // Nothing says which one the classes are in, so a create the reviewer can
    // map beats filing them in the wrong town.
    it('creates rather than guess when the node’s own state is unknown', () => {
      const existing = [...states, springfield(20, 4), springfield(21, 3)]

      expect(
        matchNode(city({ name: 'Springfield', subdivisionCode: null }), existing, { subdivisionOf }),
      ).toEqual({ kind: 'create' })
    })
  })

  // ⚠ **The Atlas seed put some city-states on the city's own feature.** A city
  // matched onto the state Berlin files every class under a state, which the
  // commit refuses row by row; creating it fails the unique `mapboxId`.
  it('refuses a feature held at another level instead of matching it', () => {
    const existing = [region({ id: 7, level: 'region', name: 'Berlin', mapboxId: 'place.berlin' })]

    expect(matchNode(city({ name: 'Berlin', mapboxId: 'place.berlin' }), existing)).toEqual({
      kind: 'elsewhere',
      regionId: 7,
      name: 'Berlin',
    })
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

describe('matchState', () => {
  const germany = region({ id: TARGET_ID, level: 'country', name: 'Germany', parentId: null })
  const bavaria = (overrides: Partial<ExistingRegion> = {}) =>
    region({ id: 30, level: 'region', name: 'Bavaria', slug: 'bavaria', ...overrides })
  const bayern = { code: 'BY', name: 'Bayern', mapboxIds: ['region.bavaria'] }

  function codeOf(existing: ExistingRegion[], featureCodes = new Map<string, string>()) {
    return stateCodeResolver({ existing, countryCode: 'DE', featureCodes }).codeOf
  }

  // ⚠ **ISO lists the endonym.** Matching on ISO's name alone proposed a second
  // Bavaria, and a second copy of every city under it.
  it('matches an exonym on its Mapbox region feature', () => {
    const existing = [germany, bavaria({ mapboxId: 'region.bavaria' })]

    expect(matchState(bayern, existing, codeOf(existing))).toMatchObject({
      kind: 'existing',
      regionId: 30,
      name: 'Bavaria',
    })
  })

  it('matches a hand-seeded state on the code its name or slug spells', () => {
    const byName = [germany, bavaria({ name: 'Bayern', slug: 'bayern-region', mapboxId: 'manual-1' })]
    const bySlug = [germany, bavaria({ name: 'Freistaat', slug: 'by', mapboxId: 'manual-1' })]

    expect(matchState(bayern, byName, codeOf(byName))).toMatchObject({ regionId: 30 })
    expect(matchState(bayern, bySlug, codeOf(bySlug))).toMatchObject({ regionId: 30 })
  })

  it('reads a region feature’s code off the rows that geocoded into it', () => {
    // A batch for another state's cities says what this feature is, even where
    // no proposed state names it.
    const existing = [germany, bavaria({ mapboxId: 'region.bavaria' })]
    const codes = codeOf(existing, new Map([['region.bavaria', 'BY']]))

    expect(matchState({ ...bayern, mapboxIds: [] }, existing, codes)).toMatchObject({
      regionId: 30,
    })
  })

  it('creates a state the target does not hold, and never one outside it', () => {
    const existing = [germany, bavaria({ mapboxId: 'region.bavaria', inTarget: false })]

    expect(matchState(bayern, existing, codeOf(existing))).toEqual({ kind: 'create' })
  })

  it('does not take a city for a state', () => {
    const existing = [germany, region({ id: 31, level: 'city', name: 'Bayern', mapboxId: 'region.bavaria' })]

    expect(matchState(bayern, existing, codeOf(existing))).toEqual({ kind: 'create' })
  })
})
