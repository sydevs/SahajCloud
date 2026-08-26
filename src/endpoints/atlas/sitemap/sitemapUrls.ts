import type { AtlasSitemapUrl } from '../../responseTypes'
import type { CanonicalOwner } from '@/lib/atlas/regionOwners'

/**
 * The two pure rules behind `GET /api/atlas/sitemap`: which regions a client
 * owns, and which of the documents in them are publishable as sitemap entries.
 *
 * Kept out of the handler so both are unit-testable without a database — the
 * ownership carve-out in particular has a case (a nearer client's subtree) that
 * is tedious to set up against Postgres and trivial to state as a map.
 */

/** The URL fields the shaper reads off a region or event document. */
export interface SitemapCandidate {
  /** The document's atlas route, e.g. `/nl/amsterdam`. Null when no path exists. */
  webPath?: string | null
  /** The document's canonical URL. Null when no owner can publish one. */
  webUrl?: string | null
  updatedAt?: string | null
}

/**
 * The regions whose canonical URLs `clientId` owns, as ids.
 *
 * Read off the resolved owner map rather than off the client's own
 * `canonical.region`, so the **nearest-ancestor** rule applies in this direction
 * too: a country-level owner's sitemap must not list a city that a nearer client
 * owns, because that city's canonical URLs point at the nearer client's domain.
 * Publishing them anyway would be a sitemap advertising somebody else's pages.
 *
 * Sorted ascending so a caller's `where: { id: { in: … } }` is stable.
 */
export function ownedRegionIds(
  ownerById: ReadonlyMap<number, CanonicalOwner>,
  clientId: number,
): number[] {
  const ids: number[] = []
  for (const [regionId, owner] of ownerById) {
    if (owner.clientId === clientId) ids.push(regionId)
  }
  return ids.sort((a, b) => a - b)
}

/**
 * Shape documents into sitemap entries, dropping every one that cannot be
 * published and sorting the rest by route.
 *
 * A document is dropped when it has **no canonical URL** (nothing in its
 * ancestry can publish one) or **no route** (a blank slug somewhere in the
 * chain, which `buildRegionPath` refuses to paper over). A sitemap entry with no
 * URL is not a thing, and emitting one as `null` would make the count a lie and
 * force every consumer to filter.
 *
 * The sort is by **code unit**, deliberately not `localeCompare`, whose ordering
 * depends on the runtime's ICU data: the body is edge-cached, so the same
 * ownership has to serialize identically on every instance.
 */
export function sitemapUrls(docs: readonly SitemapCandidate[]): AtlasSitemapUrl[] {
  const rows: AtlasSitemapUrl[] = []
  for (const doc of docs) {
    if (!doc.webUrl || !doc.webPath || !doc.updatedAt) continue
    rows.push({ loc: doc.webUrl, lastmod: doc.updatedAt, route: doc.webPath })
  }
  return rows.sort((a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : 0))
}
