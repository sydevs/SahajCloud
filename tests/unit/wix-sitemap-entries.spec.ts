import type { AtlasSitemapResolution } from '../../src/endpoints/atlas/sitemap/resolve'

import { describe, expect, it } from 'vitest'

import { wixSitemapEntries } from '../../src/endpoints/atlas/wix/wixSitemap'

/**
 * Which of a client's owned URLs reach a Wix sitemap, and how they are spelled.
 *
 * ⚠ **Fixture pre-mortem.** `resolution` is declared as the real
 * `AtlasSitemapResolution`, whose `urls` are `AtlasSitemapUrl` rows
 * (`loc` / `lastmod` / `route`) and whose `titleByRoute` is keyed on `route` —
 * verified against `src/endpoints/atlas/sitemap/resolve.ts`, which builds it
 * from each document's own `webPath`. A drift there is a compile error here.
 */

const resolution = (
  urls: AtlasSitemapResolution['urls'],
  titles: Record<string, string> = {},
): AtlasSitemapResolution => ({ urls, titleByRoute: new Map(Object.entries(titles)) })

const row = (route: string, host = 'sahajayoga.ca') => ({
  loc: `https://${host}/classes${route}`,
  lastmod: '2026-10-01T00:00:00.000Z',
  route,
})

describe('wixSitemapEntries', () => {
  it('spells each url relative to the site root, with the router prefix', () => {
    const entries = wixSitemapEntries({
      resolution: resolution([row('/ca/ontario')], { '/ca/ontario': 'Ontario' }),
      prefix: 'free-classes',
      host: 'sahajayoga.ca',
    })
    expect(entries).toEqual([
      { url: '/free-classes/ca/ontario', title: 'Ontario', lastmod: '2026-10-01T00:00:00.000Z' },
    ])
  })

  it('drops a page on another host, however it got into the answer', () => {
    // A shared key or a mis-set canonical.embed; Wix would republish it as this
    // site's own page.
    const entries = wixSitemapEntries({
      resolution: resolution([row('/ca/ontario'), row('/nl/amsterdam', 'sahajayoga.nl')]),
      prefix: 'free-classes',
      host: 'sahajayoga.ca',
    })
    expect(entries.map((entry) => entry.url)).toEqual(['/free-classes/ca/ontario'])
  })

  it('answers nothing at all for a client with no canonical host yet', () => {
    expect(
      wixSitemapEntries({
        resolution: resolution([row('/ca/ontario')]),
        prefix: 'free-classes',
        host: null,
      }),
    ).toEqual([])
  })

  it('falls back to the route rather than an empty title', () => {
    const entries = wixSitemapEntries({
      resolution: resolution([row('/ca/ontario')]),
      prefix: 'free-classes',
      host: 'sahajayoga.ca',
    })
    expect(entries[0].title).toBe('/ca/ontario')
  })
})
