import { describe, expect, it } from 'vitest'

import { ownedRegionIds, sitemapUrls } from '@/endpoints/atlas/sitemap/sitemapUrls'
import type { CanonicalOwner } from '@/lib/atlas/regionOwners'

/**
 * The pure half of `GET /api/atlas/sitemap` (#650): who owns which routes, and
 * which documents are publishable as entries. The database-backed half — that
 * every `loc` matches what `/api/atlas/seo` returns as `canonical` — is in
 * `tests/int/atlas-sitemap.int.spec.ts`.
 */

const owner = (clientId: number, domain: string): CanonicalOwner => ({
  clientId,
  domain,
  mount: '/map',
  routing: 'path',
})

describe('ownedRegionIds', () => {
  // Ownership is resolved per region to its *nearest* declaring ancestor, so a
  // country-level client's sitemap must stop at the boundary of a city another
  // client owns — those pages canonically live on the other client's domain,
  // and listing them would be a sitemap advertising somebody else's site.
  it('excludes a subtree a nearer client owns', () => {
    const uk = owner(1, 'sahajayoga.org.uk')
    const london = owner(2, 'sahajayogalondon.co.uk')
    const ownerById = new Map([
      [10, uk], // United Kingdom
      [11, uk], // Manchester — nothing nearer
      [12, london], // Greater London — declared by client 2
      [13, london], // a venue beneath it, resolved to the same nearer owner
    ])

    expect(ownedRegionIds(ownerById, 1)).toEqual([10, 11])
    expect(ownedRegionIds(ownerById, 2)).toEqual([12, 13])
  })

  // The acceptance criterion behind `{ "urls": [] }`: a client with no
  // declaration is not an error case, it simply owns nothing.
  it('gives a client that owns nothing an empty list', () => {
    expect(ownedRegionIds(new Map([[10, owner(1, 'a.test')]]), 99)).toEqual([])
    expect(ownedRegionIds(new Map(), 1)).toEqual([])
  })

  it('returns ids ascending, whatever order the map iterates in', () => {
    const mine = owner(1, 'a.test')
    expect(
      ownedRegionIds(
        new Map([
          [30, mine],
          [10, mine],
          [20, mine],
        ]),
        1,
      ),
    ).toEqual([10, 20, 30])
  })
})

describe('sitemapUrls', () => {
  const region = {
    webPath: '/nl/amsterdam',
    webUrl: 'https://sahajayoga.nl/find-a-class/nl/amsterdam',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }

  it('shapes a document into loc / lastmod / route', () => {
    expect(sitemapUrls([region])).toEqual([
      {
        loc: 'https://sahajayoga.nl/find-a-class/nl/amsterdam',
        lastmod: '2026-08-01T00:00:00.000Z',
        route: '/nl/amsterdam',
      },
    ])
  })

  // A sitemap entry with no URL is not a thing. Emitting one as null would make
  // the count a lie and force every consumer to filter — so it is dropped, and
  // the count stays the consumer's only signal.
  it('drops a document that cannot be published, rather than emitting a null loc', () => {
    expect(sitemapUrls([{ ...region, webUrl: null }])).toEqual([])
    // No path either: a blank slug somewhere in the ancestry, which
    // `buildRegionPath` refuses to paper over with a `//`-containing route.
    expect(sitemapUrls([{ ...region, webPath: null }])).toEqual([])
  })

  // The body is edge-cached, so identical ownership has to serialize identically
  // — including across instances, which rules out a locale-sensitive sort.
  it('sorts by route so the same ownership yields a byte-stable body', () => {
    const at = { updatedAt: region.updatedAt }
    const rows = sitemapUrls([
      { ...at, webPath: '/nl/amsterdam/1204', webUrl: 'https://h.test/nl/amsterdam/1204' },
      { ...at, webPath: '/nl', webUrl: 'https://h.test/nl' },
      { ...at, webPath: '/nl/amsterdam', webUrl: 'https://h.test/nl/amsterdam' },
    ])
    expect(rows.map((row) => row.route)).toEqual(['/nl', '/nl/amsterdam', '/nl/amsterdam/1204'])
  })
})
