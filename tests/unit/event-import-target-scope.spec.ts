/**
 * What "inside the target region" reduces to (#828).
 *
 * The region tree stores no ISO code, so the chain above a target is read two
 * ways — the slug the Atlas seed gave a country, and the English name anything
 * added since would have. Both readings are pinned here, and so is the refusal
 * when neither answers: an unchecked country is every row in the world admitted
 * into somebody's region.
 */
import { describe, expect, it } from 'vitest'

import {
  resolveTargetScope,
  type TargetChainNode,
} from '@/collections/EventImports/resolve/targetScope'

const country = (overrides: Partial<TargetChainNode> = {}): TargetChainNode => ({
  level: 'country',
  name: 'Germany',
  slug: 'de',
  ...overrides,
})

const state = (overrides: Partial<TargetChainNode> = {}): TargetChainNode => ({
  level: 'region',
  name: 'Bayern',
  slug: 'bayern',
  ...overrides,
})

const city = (overrides: Partial<TargetChainNode> = {}): TargetChainNode => ({
  level: 'city',
  name: 'München',
  slug: 'munchen',
  ...overrides,
})

/** The scope, or a thrown assertion naming the refusal instead. */
function scopeOf(chain: TargetChainNode[]) {
  const result = resolveTargetScope(chain)
  if (!result.ok) throw new Error(`expected a scope, got: ${result.error}`)
  return result.scope
}

/** The narrowing a target does not get, or null. */
function warningOf(chain: TargetChainNode[]): string | null {
  const result = resolveTargetScope(chain)
  if (!result.ok) throw new Error(`expected a scope, got: ${result.error}`)
  return result.warning ?? null
}

function refusalOf(chain: TargetChainNode[]): string {
  const result = resolveTargetScope(chain)
  if (result.ok) throw new Error('expected a refusal, got a scope')
  return result.error
}

describe('resolveTargetScope — the country', () => {
  it('reads the ISO code off a country slug', () => {
    expect(scopeOf([country({ name: 'Deutschland' })])).toEqual({
      countryCode: 'DE',
      subdivisionCode: null,
    })
  })

  it('falls back to the English name when the slug is not a code', () => {
    expect(scopeOf([country({ slug: 'germany' })]).countryCode).toBe('DE')
  })

  it('refuses a chain with no country above the target', () => {
    expect(refusalOf([state(), city()])).toContain('no country above it')
  })

  it('refuses a country that matches neither reading, and names it', () => {
    const error = refusalOf([country({ name: 'Deutchland', slug: 'deutchland' })])
    expect(error).toContain('Deutchland')
    expect(error).toContain('matches no ISO country')
  })

  it('ignores a two-letter slug that is not a country code', () => {
    // `zz` is unassigned, so the slug reading must decline rather than take any
    // two letters — the name is then the only answer left.
    expect(scopeOf([country({ name: 'Germany', slug: 'zz' })]).countryCode).toBe('DE')
  })
})

describe('resolveTargetScope — the subdivision', () => {
  it('is null when the target hangs straight off its country', () => {
    // The mixed tree the Atlas already has: France carries no state layer.
    expect(scopeOf([country({ name: 'France', slug: 'fr' }), city({ name: 'Paris' })])).toEqual({
      countryCode: 'FR',
      subdivisionCode: null,
    })
  })

  it('reads the ISO 3166-2 code off a state name', () => {
    expect(scopeOf([country(), state(), city()]).subdivisionCode).toBe('BY')
  })

  it('reads it off the slug when a state was slugged with its code', () => {
    expect(
      scopeOf([country(), state({ name: 'Freistaat Bayern', slug: 'by' })]).subdivisionCode,
    ).toBe('BY')
  })

  it('degrades to the country for a state with no ISO code, and says so', () => {
    // ⚠ Measured, not conceded: 19 of the Atlas tree's 101 `region` nodes match
    // no ISO 3166-2 subdivision, every UK one among them. A refusal here made
    // the whole UK unimportable.
    const chain = [country({ name: 'United Kingdom', slug: 'gb' }), state({ name: 'South East' })]

    expect(scopeOf(chain)).toEqual({ countryCode: 'GB', subdivisionCode: null })
    expect(warningOf(chain)).toContain('South East')
    expect(warningOf(chain)).toContain('GB')
  })

  it('names no warning for a state it could confine rows to', () => {
    expect(warningOf([country(), state()])).toBeNull()
  })

  it('degrades a sub-region the dataset does not list, rather than refusing', () => {
    expect(scopeOf([country(), state({ name: 'Oberbayern', slug: 'oberbayern' })])).toEqual({
      countryCode: 'DE',
      subdivisionCode: null,
    })
  })

  it('resolves a state against its own country, not another', () => {
    // `CA` is California in the US and nothing in Germany, so a chain naming
    // the German country must not take it.
    expect(
      scopeOf([country(), state({ name: 'California', slug: 'ca' })]).subdivisionCode,
    ).toBeNull()
    expect(
      scopeOf([country({ name: 'United States', slug: 'us' }), state({ name: 'California' })])
        .subdivisionCode,
    ).toBe('CA')
  })
})

describe('resolveTargetScope — reading order', () => {
  it('takes the country node wherever it sits in the chain', () => {
    // A breadcrumb trail arrives root-first, but nothing in the shape enforces
    // it, so the level decides rather than the position.
    expect(scopeOf([city(), state(), country()])).toEqual({
      countryCode: 'DE',
      subdivisionCode: 'BY',
    })
  })

  it('ignores a venue node entirely', () => {
    expect(
      scopeOf([country(), state(), city(), { level: 'venue', name: 'Bayern', slug: 'halle' }]),
    ).toEqual({ countryCode: 'DE', subdivisionCode: 'BY' })
  })
})

describe('resolveTargetScope — dependent territories', () => {
  // ⚠ The real Atlas files Martinique, Guadeloupe, Réunion and Mayotte under
  // France, but Mapbox answers with each as its own country. A scope of
  // `{ FR, MQ }` refused every row there.
  const france = country({ name: 'France', slug: 'fr' })

  it.each([
    ['Martinique', 'MQ'],
    ['Guadeloupe', 'GP'],
    ['La Réunion', 'RE'],
    ['Mayotte', 'YT'],
  ])('scopes %s as the country Mapbox files it as', (name, code) => {
    expect(scopeOf([france, state({ name, slug: name.toLowerCase() }), city()])).toEqual({
      countryCode: code,
      subdivisionCode: null,
      parentCountryCode: 'FR',
    })
  })

  it('reads a territory the dataset lists under a numeric code', () => {
    expect(
      scopeOf([
        country({ name: 'Norway', slug: 'no' }),
        state({ name: 'Svalbard', slug: 'svalbard' }),
      ]).countryCode,
    ).toBe('SJ')
  })

  it('reads a territory the dataset does not list under its parent, by its country name', () => {
    expect(
      scopeOf([
        country({ name: 'Netherlands', slug: 'nl' }),
        state({ name: 'Aruba', slug: 'aruba' }),
      ]),
    ).toEqual({ countryCode: 'AW', subdivisionCode: null, parentCountryCode: 'NL' })
    expect(
      scopeOf([country({ name: 'Denmark', slug: 'dk' }), state({ name: 'Greenland' })]).countryCode,
    ).toBe('GL')
  })

  it('reads Puerto Rico as its own country under the US', () => {
    expect(
      scopeOf([country({ name: 'United States', slug: 'us' }), state({ name: 'Puerto Rico' })]),
    ).toEqual({ countryCode: 'PR', subdivisionCode: null, parentCountryCode: 'US' })
  })

  it('leaves an ordinary state a state, even one named like a country', () => {
    // Georgia the state is `US-GA`; Georgia the country is `GE`, and no
    // territory of the US.
    expect(
      scopeOf([country({ name: 'United States', slug: 'us' }), state({ name: 'Georgia' })]),
    ).toEqual({ countryCode: 'US', subdivisionCode: 'GA' })
    expect(scopeOf([france, state({ name: 'Île-de-France', slug: 'ile-de-france' })])).toEqual({
      countryCode: 'FR',
      subdivisionCode: 'IDF',
    })
  })

  it('degrades a state in a country whose subdivisions carry no code, rather than throwing', () => {
    // Building Puerto Rico's subdivision index threw on its codeless entries,
    // which failed every endpoint for a target there.
    expect(
      scopeOf([country({ name: 'Puerto Rico', slug: 'pr' }), state({ name: 'San Juan' })]),
    ).toEqual({ countryCode: 'PR', subdivisionCode: null })
  })
})
