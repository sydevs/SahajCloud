import type { AtlasWixSitemapEntry } from '../../responseTypes'
import type { AtlasSitemapResolution } from '../sitemap/resolve'

/**
 * Turn one client's owned atlas URLs into the entries a Velo `*_SiteMap`
 * function returns (#1055).
 *
 * Two rules, and both are about what a sitemap is *for*:
 *
 * - **This host only.** `GET /api/atlas/sitemap` publishes absolute canonical
 *   URLs, and a client's answer can legitimately contain another host's — a
 *   mis-set `canonical.embed`, or a key shared between two sites. Wix resolves a
 *   `WixRouterSitemapEntry.url` against the site's own domain, so a foreign
 *   canonical would be republished as this site's page. That is the same guard
 *   the WordPress plugin numbers 15, and the reason it is a guard rather than a
 *   filter nobody notices: an entry dropped here is a page in nobody's sitemap,
 *   which is better than a 404 submitted to a crawler on purpose.
 * - **Relative, with the prefix.** ⚠ The opposite of
 *   `AtlasWixRouteResponse.redirect`, which carries no prefix because the router
 *   composes one. A sitemap entry has no router between it and Wix, so it has to
 *   arrive as the address the site serves.
 */
export function wixSitemapEntries(args: {
  resolution: AtlasSitemapResolution
  /** The router's own prefix, as the Install tab validated it: no slashes. */
  prefix: string
  /** The host this client serves. An entry on any other host is dropped. */
  host: string | null
}): AtlasWixSitemapEntry[] {
  const { resolution, prefix, host } = args
  if (!host) return []

  const entries: AtlasWixSitemapEntry[] = []
  for (const url of resolution.urls) {
    if (URL.parse(url.loc)?.host !== host) continue
    entries.push({
      url: `/${prefix}${url.route}`,
      // The route stands in for a document with no name of its own, which no
      // region or event has — but an empty `title` renders as a blank row in
      // Wix's own sitemap, and the route at least says what the page is.
      title: resolution.titleByRoute.get(url.route) ?? url.route,
      lastmod: url.lastmod,
    })
  }
  return entries
}
