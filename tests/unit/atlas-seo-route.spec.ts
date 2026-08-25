import { describe, expect, it } from 'vitest'

import { MAX_ATLAS_ROUTE_LENGTH, parseAtlasRoute } from '../../src/endpoints/atlas/seo/atlasRoute'

/**
 * Route parsing for `GET /api/atlas/seo` (#645).
 *
 * The rule under test is not ours alone — it is the widget's `resolveStack`
 * applied to the same `?atlas=` string. A host that renders a route server-side
 * and the widget that upgrades over it must agree on which document that route
 * names, so the cases below are written as "what does the widget do with this",
 * not "what did we happen to implement".
 */
describe('parseAtlasRoute', () => {
  describe('region routes', () => {
    it.each([
      ['/gb', 'gb'],
      ['/gb/london', 'london'],
      ['/belgium/flanders/antwerp/downtown-hall', 'downtown-hall'],
      // Extra and trailing slashes are the caller's formatting, not structure.
      ['/gb/london/', 'london'],
      ['//gb//london', 'london'],
      ['gb/london', 'london'],
    ])('resolves %s to the region slug %s', (route, slug) => {
      expect(parseAtlasRoute(route)).toEqual({ kind: 'region', slug })
    })

    // Ancestry is exactly the part of a URL that goes stale — a region moved in
    // the tree, or a country re-slugged to its ISO code (#556). Ignoring it
    // keeps an old inbound link resolving; the answer's canonical corrects it.
    it('keys on the terminal slug alone, whatever ancestry precedes it', () => {
      expect(parseAtlasRoute('/wrong/legacy/chain/london')).toEqual({
        kind: 'region',
        slug: 'london',
      })
    })

    it('decodes percent-encoded segments, because an address bar stores them encoded', () => {
      // The stored `slug` holds the decoded value, so a route arriving from a
      // URL bar has to be decoded before it can match.
      expect(parseAtlasRoute('/be/li%C3%A8ge')).toEqual({ kind: 'region', slug: 'liège' })
    })

    it('leaves a malformed escape alone rather than throwing', () => {
      expect(parseAtlasRoute('/gb/100%')).toEqual({ kind: 'region', slug: '100%' })
    })
  })

  describe('event routes', () => {
    it('reads an all-digits terminal segment as an event id', () => {
      expect(parseAtlasRoute('/gb/london/1204')).toEqual({ kind: 'event', id: 1204 })
    })

    it('resolves an event by id alone — the region prefix is ancestry only', () => {
      // Deliberate: a stale or legacy prefix still lands on the right event, and
      // the canonical the endpoint answers with corrects the URL.
      expect(parseAtlasRoute('/507')).toEqual({ kind: 'event', id: 507 })
      expect(parseAtlasRoute('/some/wrong/chain/507')).toEqual({ kind: 'event', id: 507 })
    })

    it('refuses an id that no `int4` column could hold', () => {
      expect(parseAtlasRoute('/99999999999')).toBeNull()
      expect(parseAtlasRoute('/0')).toBeNull()
    })
  })

  describe('view and legacy segments', () => {
    it.each([
      ['/gb/london/1204/register', { kind: 'event', id: 1204 }],
      ['/gb/london/1204/share', { kind: 'event', id: 1204 }],
      ['/gb/london/online', { kind: 'region', slug: 'london' }],
      ['/gb/london/calendar', { kind: 'region', slug: 'london' }],
      // Case-insensitive, matching the widget's own lowercased comparison.
      ['/gb/london/REGISTER', { kind: 'region', slug: 'london' }],
    ])('drops the view segment in %s', (route, expected) => {
      expect(parseAtlasRoute(route)).toEqual(expected)
    })

    it.each([
      ['/events/507', { kind: 'event', id: 507 }],
      ['/regions/gb/london', { kind: 'region', slug: 'london' }],
      ['/areas/gb', { kind: 'region', slug: 'gb' }],
      ['/venues/gb/london', { kind: 'region', slug: 'london' }],
    ])('drops the legacy Atlas prefix in %s', (route, expected) => {
      expect(parseAtlasRoute(route)).toEqual(expected)
    })
  })

  describe('routes that name nothing', () => {
    it.each([
      ['the atlas root', '/'],
      ['an empty string', ''],
      ['a bare search view', '/search'],
      ['a bare filters view', '/filters'],
      ['nothing but legacy prefixes', '/events/areas'],
    ])('returns null for %s', (_label, route) => {
      // Not a failure: the host owns its own landing page's metadata, and there
      // is no document here to describe it with.
      expect(parseAtlasRoute(route)).toBeNull()
    })

    it.each([
      ['a query string spliced in', '/gb/london?utm_source=x'],
      ['a fragment', '/gb/london#!/x'],
      ['whitespace', '/gb/lon don'],
    ])('refuses %s rather than guessing which half was meant', (_label, route) => {
      expect(parseAtlasRoute(route)).toBeNull()
    })
  })

  describe('bounds', () => {
    it('refuses a route past the length ceiling', () => {
      const long = `/${'a'.repeat(MAX_ATLAS_ROUTE_LENGTH)}`
      expect(long.length).toBeGreaterThan(MAX_ATLAS_ROUTE_LENGTH)
      expect(parseAtlasRoute(long)).toBeNull()
    })

    it('refuses a route with more segments than any real one has', () => {
      // The deepest real chain is four levels plus an event id.
      expect(
        parseAtlasRoute(`/${Array.from({ length: 13 }, (_, i) => `s${i}`).join('/')}`),
      ).toBeNull()
      expect(
        parseAtlasRoute(`/${Array.from({ length: 5 }, (_, i) => `s${i}`).join('/')}`),
      ).not.toBeNull()
    })
  })
})
