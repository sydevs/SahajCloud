import type { AtlasSeoDocument } from '../../src/endpoints/atlas/seo/seoDocument'

import { describe, expect, it } from 'vitest'

import { jsonLdEscape } from '../../src/endpoints/atlas/seo/jsonLd'
import {
  WIX_CACHE_SECONDS,
  wixLinks,
  wixMetaTags,
  wixNotFound,
  wixRouteAnswer,
  wixStructuredData,
} from '../../src/endpoints/atlas/wix/wixDocument'
import { localeFromWixLang } from '../../src/endpoints/atlas/wix/wixLang'
import {
  isProbePath,
  normalizeAtlasPath,
  routeRelation,
} from '../../src/endpoints/atlas/wix/wixRoute'
import { PROBE_SEGMENT_PREFIX } from '../../src/lib/embedVerification/verifyEmbed'

/**
 * The Wix serializer's shape, independent of any read.
 *
 * `tests/unit/wix-route-body.spec.ts` covers the markup half, and
 * `tests/int/atlas-wix.int.spec.ts` the two handlers end to end.
 */

const GRAPH = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Event', name: 'Meditation & <you>' },
    { '@type': 'BreadcrumbList', itemListElement: [] },
  ],
}

const regionAnswer = (overrides: Partial<AtlasSeoDocument> = {}): AtlasSeoDocument =>
  ({
    type: 'region',
    id: 7,
    route: '/ca/ontario',
    locale: 'en',
    title: 'Free meditation classes in Ontario',
    description: 'Twelve classes.',
    canonical: 'https://sahajayoga.ca/classes/ca/ontario',
    alternates: [
      { hreflang: 'en', href: 'https://sahajayoga.ca/classes/ca/ontario?locale=en' },
      { hreflang: 'x-default', href: 'https://sahajayoga.ca/classes/ca/ontario' },
    ],
    openGraph: { 'og:title': 'Ontario', 'og:type': 'website' },
    jsonLdGraph: GRAPH,
    breadcrumbs: [],
    content: { name: 'Ontario', subtitle: null, level: 'region', events: [], eventCount: 0 },
    ...overrides,
  }) as AtlasSeoDocument

describe('wixStructuredData', () => {
  it('is the graph /api/atlas/seo serializes, node for node', () => {
    // Both surfaces read one graph, so there is nothing here that can disagree
    // with what the published endpoint escapes — the point of taking objects.
    expect(wixStructuredData(GRAPH)).toEqual(
      GRAPH['@graph'].map((node) => ({ '@context': GRAPH['@context'], ...node })),
    )
  })

  it('escapes to exactly what /api/atlas/seo publishes for the same route', () => {
    // The two shapes may differ in form and must not differ in content.
    expect(JSON.parse(jsonLdEscape(GRAPH))).toEqual(GRAPH)
  })

  it('carries the context onto every node, since Wix emits one script each', () => {
    for (const node of wixStructuredData(GRAPH)) {
      expect(node['@context']).toBe('https://schema.org')
    }
  })

  it('keeps a bare document as one node', () => {
    expect(wixStructuredData({ '@type': 'Place' })).toEqual([{ '@type': 'Place' }])
  })
})

describe('wixMetaTags', () => {
  it('puts description and robots in metaTags, where Wix reads them', () => {
    const tags = wixMetaTags(regionAnswer(), true)
    expect(tags).toContainEqual({ name: 'description', content: 'Twelve classes.' })
    expect(tags).toContainEqual({ name: 'robots', content: 'noindex' })
  })

  it('omits robots unless the page is unindexed', () => {
    expect(wixMetaTags(regionAnswer(), false)).not.toContainEqual(
      expect.objectContaining({ name: 'robots' }),
    )
  })

  it('omits an absent description rather than sending it empty', () => {
    const tags = wixMetaTags(regionAnswer({ description: null }), false)
    expect(tags).not.toContainEqual(expect.objectContaining({ name: 'description' }))
  })

  it('keys Open Graph on property, not name', () => {
    expect(wixMetaTags(regionAnswer(), false)).toContainEqual({
      property: 'og:title',
      content: 'Ontario',
    })
  })
})

describe('wixLinks', () => {
  it('is empty for a self-canonical, so Wix writes its own', () => {
    expect(wixLinks(regionAnswer(), true)).toEqual([])
  })

  it('publishes the canonical and its alternates otherwise', () => {
    expect(wixLinks(regionAnswer(), false)).toEqual([
      { rel: 'canonical', href: 'https://sahajayoga.ca/classes/ca/ontario' },
      {
        rel: 'alternate',
        href: 'https://sahajayoga.ca/classes/ca/ontario?locale=en',
        hreflang: 'en',
      },
      { rel: 'alternate', href: 'https://sahajayoga.ca/classes/ca/ontario', hreflang: 'x-default' },
    ])
  })

  it('is empty when there is no canonical to publish', () => {
    expect(wixLinks(regionAnswer({ canonical: null }), false)).toEqual([])
  })
})

describe('wixRouteAnswer', () => {
  it('renders a route the host is already serving', () => {
    const answer = wixRouteAnswer({
      seo: regionAnswer(),
      relation: 'exact',
      noindex: false,
      selfCanonical: true,
    })
    expect(answer.status).toBe(200)
    expect(answer.redirect).toBeNull()
    expect(answer.data?.route).toBe('/ca/ontario')
    expect(answer.cacheSeconds).toBe(WIX_CACHE_SECONDS)
  })

  it('redirects to the route the document actually lives at, as an atlas route', () => {
    const answer = wixRouteAnswer({
      seo: regionAnswer(),
      relation: 'moved',
      noindex: false,
      selfCanonical: false,
    })
    expect(answer.status).toBe(301)
    // Never a URL, and never prefixed — the router owns its prefix.
    expect(answer.redirect).toBe('/ca/ontario')
    expect(answer.data).toBeNull()
  })

  it('renders a view route rather than redirecting the widget own deep link', () => {
    const answer = wixRouteAnswer({
      seo: regionAnswer(),
      relation: 'view',
      noindex: false,
      selfCanonical: false,
    })
    expect(answer.status).toBe(200)
    // And publishes the canonical, so a crawler folds the view into the page.
    expect(answer.head.links[0]).toEqual({
      rel: 'canonical',
      href: 'https://sahajayoga.ca/classes/ca/ontario',
    })
  })

  it('renders no page on a 404', () => {
    expect(wixNotFound()).toMatchObject({ status: 404, redirect: null, data: null })
  })
})

describe('localeFromWixLang', () => {
  it('takes an exact locale code', () => {
    expect(localeFromWixLang('pt-BR')).toBe('pt-BR')
  })

  it('resolves a bare subtag to a regional variant that has no bare form', () => {
    // The case a plain isValidLocale check sends to English.
    expect(localeFromWixLang('pt')).toBe('pt-BR')
  })

  it('resolves a bare subtag to the unmarked variant where one exists', () => {
    expect(localeFromWixLang('en')).toBe('en')
  })

  it('falls back to English rather than refusing', () => {
    expect(localeFromWixLang('zz')).toBe('en')
    expect(localeFromWixLang(undefined)).toBe('en')
  })
})

describe('normalizeAtlasPath', () => {
  it('spells a route the way webPath does', () => {
    expect(normalizeAtlasPath('/ca/ontario/')).toBe('/ca/ontario')
    expect(normalizeAtlasPath('ca/ontario')).toBe('/ca/ontario')
    expect(normalizeAtlasPath('//ca//ontario//')).toBe('/ca/ontario')
  })

  it('answers / for nothing at all', () => {
    expect(normalizeAtlasPath('/')).toBe('/')
    expect(normalizeAtlasPath('')).toBe('/')
  })
})

describe('isProbePath', () => {
  it('recognises the prefix the routing probe actually writes', () => {
    expect(isProbePath(`/${PROBE_SEGMENT_PREFIX}a1b2c3`)).toBe(true)
  })

  it('recognises it under a mount with trailing segments', () => {
    expect(isProbePath(`/classes/${PROBE_SEGMENT_PREFIX}a1b2c3`)).toBe(true)
  })

  it('leaves a real route alone', () => {
    expect(isProbePath('/ca/ontario')).toBe(false)
    expect(isProbePath('/sahaj-atlas')).toBe(false)
  })
})

describe('routeRelation', () => {
  it('is exact for the same address', () => {
    expect(routeRelation('/ca/ontario', '/ca/ontario')).toBe('exact')
  })

  it('is a view when the difference is one of the widget routed views', () => {
    expect(routeRelation('/ca/ontario/calendar', '/ca/ontario')).toBe('view')
    expect(routeRelation('/ca/ontario/1204/register', '/ca/ontario/1204')).toBe('view')
    // A bare view of the root is still the root.
    expect(routeRelation('/search', '/')).toBe('view')
  })

  it('is moved for a legacy prefix', () => {
    expect(routeRelation('/events/1204', '/ca/ontario/1204')).toBe('moved')
  })

  it('is moved for stale ancestry or a re-slugged country', () => {
    expect(routeRelation('/canada/ontario', '/ca/ontario')).toBe('moved')
  })
})
