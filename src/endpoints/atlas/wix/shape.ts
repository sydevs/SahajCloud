import type { AtlasWixRouteResponse, AtlasWixSitemapEntry } from './contract'
import type { JsonLdGraph, JsonLdNode } from '../seo/jsonLd'
import type { AtlasSeoDocument } from '../seo/seoDocument'
import type { AtlasSitemapResolution } from '../sitemap/resolve'

import { PROBE_SEGMENT_PREFIX } from '@/lib/clients/verification'

import { wixBodyHtml } from './wixBody'
import { parseAtlasRoute } from '../seo/atlasRoute'

/**
 * The answers a Wix Velo router hands to `ok()` / `redirect()` / `notFound()`
 * and `*_SiteMap` (#1055).
 *
 * **A serializer, never a second resolver.** Every fact is read off the
 * document `resolveAtlasSeo` built, so the Wix page's `<title>`, canonical and
 * body are the ones WordPress and WeMeditateWeb get. A host that resolves
 * routes itself ends up with a `<head>` describing a different document than
 * its body (#645, #650).
 *
 * **Why Wix needs its own shape.** Each difference would break a current reader
 * if `/api/atlas/seo` changed to match:
 *
 * - `jsonLd` is a pre-escaped **string** there, because the WordPress plugin
 *   echoes it raw into a `<script>`. Wix serializes `structuredData` itself, so
 *   it needs objects, and handing it a string would publish a quoted blob.
 * - No HTML crosses `/api/atlas/seo`. Wix's only body sink is
 *   `$w('#…').html`, so the markup has to be built here.
 * - `description` and `robots` must be `metaTags` rows. Wix's renderer reads no
 *   top-level `description` or `noIndex`, so the other shape publishes neither.
 */

type WixHead = AtlasWixRouteResponse['head']

/** Wix's own cache is what bounds our request volume. */
export const WIX_CACHE_SECONDS = 300

/** An empty head, for the two answers that render no page. */
const EMPTY_HEAD: WixHead = { title: '', metaTags: [], links: [], structuredData: [] }

/**
 * The route spelled the way `webPath` spells it, so `requested === seo.route`
 * means "the host is already serving the right address".
 */
export function normalizeAtlasPath(path: string): string {
  const segments = path.split('/').filter(Boolean)
  return segments.length === 0 ? '/' : `/${segments.join('/')}`
}

/**
 * Is this the routing probe's own URL?
 *
 * ⚠ **It has to be answered as the root, with `noindex`, or `probeRouting`
 * fails against the real 404** (#644) and demotes every Wix client to `?atlas=`
 * URLs. The control render at `<origin>/<token>` is outside the router's
 * prefix, so Wix still 404s it, as the probe needs. Matched in any segment,
 * since `routingProbeUrls` allows a mount with trailing segments of its own.
 */
export function isProbePath(path: string): boolean {
  return path
    .split('/')
    .filter(Boolean)
    .some((segment) => segment.toLowerCase().startsWith(PROBE_SEGMENT_PREFIX))
}

/**
 * How the route the host asked for relates to the one the document lives at.
 *
 * - **`view`** — the same document through one of the widget's own view
 *   segments (`/gb/london/calendar`, a bare `/search`). The widget writes these
 *   links itself, so it renders and publishes the canonical instead.
 * - **`moved`** — a legacy prefix (`/events/1204`), stale ancestry, or a
 *   re-slugged country (#556). Nothing links there on purpose, so a `301`.
 *
 * Compared on the **non-view segments**, which are what `parseAtlasRoute` keys
 * a document on.
 */
export type RouteRelation = 'exact' | 'view' | 'moved'

export function routeRelation(requested: string, resolved: string): RouteRelation {
  if (requested === resolved) return 'exact'

  // The parser owns the reserved words, so this is no second copy of that list.
  const keyOf = (path: string): string =>
    path
      .split('/')
      .filter(Boolean)
      .filter((segment) => parseAtlasRoute(`/${segment}`)?.kind !== 'root')
      .join('/')

  return keyOf(requested) === keyOf(resolved) ? 'view' : 'moved'
}

/**
 * The JSON-LD graph as the array of nodes Wix publishes, one `<script>` each.
 *
 * ⚠ **The same graph `/api/atlas/seo` serializes, never a second one** — two
 * documents for one route are free to disagree the day an `@type` changes.
 */
export function wixStructuredData(graph: JsonLdGraph): JsonLdNode[] {
  // A node with no `@context` is not a schema.org document.
  return graph['@graph'].map((node) => ({ '@context': graph['@context'], ...node }))
}

/**
 * The `<meta>` rows. A missing `description` is omitted, not sent empty: an
 * empty one claims the page has no summary, not that we have written none.
 */
export function wixMetaTags(seo: AtlasSeoDocument, noindex: boolean): WixHead['metaTags'] {
  const tags: WixHead['metaTags'] = []
  if (seo.description) tags.push({ name: 'description', content: seo.description })
  // No `nofollow`: an unindexed language's page should still pass a crawler
  // through to the indexed one.
  if (noindex) tags.push({ name: 'robots', content: 'noindex' })
  for (const [property, content] of Object.entries(seo.openGraph)) {
    tags.push({ property, content })
  }
  return tags
}

/** The `<link>` rows, or none when the caller judged the page self-canonical. */
export function wixLinks(seo: AtlasSeoDocument, selfCanonical: boolean): WixHead['links'] {
  if (selfCanonical || !seo.canonical) return []
  return [
    { rel: 'canonical', href: seo.canonical },
    ...seo.alternates.map((alternate) => ({
      rel: 'alternate',
      href: alternate.href,
      hreflang: alternate.hreflang,
    })),
  ]
}

export function wixNotFound(): AtlasWixRouteResponse {
  return {
    status: 404,
    redirect: null,
    head: EMPTY_HEAD,
    data: null,
    cacheSeconds: WIX_CACHE_SECONDS,
  }
}

/**
 * The answer for one resolved route.
 *
 * ⚠ **Only a `moved` route is a 301**, never every route that normalized: a
 * view route normalizes too, and redirecting it would break the widget's own
 * navigation on every Wix site. See {@link routeRelation}.
 */
export function wixRouteAnswer(args: {
  seo: AtlasSeoDocument
  relation: RouteRelation
  noindex: boolean
  selfCanonical: boolean
}): AtlasWixRouteResponse {
  const { seo, relation, noindex, selfCanonical } = args

  if (relation === 'moved') {
    return {
      status: 301,
      redirect: seo.route,
      head: EMPTY_HEAD,
      data: null,
      cacheSeconds: WIX_CACHE_SECONDS,
    }
  }

  return {
    status: 200,
    redirect: null,
    head: {
      title: seo.title,
      metaTags: wixMetaTags(seo, noindex),
      links: wixLinks(seo, selfCanonical),
      structuredData: wixStructuredData(seo.jsonLdGraph),
    },
    data: { bodyHtml: wixBodyHtml(seo) },
    cacheSeconds: WIX_CACHE_SECONDS,
  }
}

/**
 * One client's owned atlas URLs as sitemap entries, **on this host only**.
 *
 * A client's answer can contain another host's canonical — a mis-set `site`, a
 * key shared between two sites — and Wix resolves an entry against the site's
 * own domain, so it would be republished as this site's page: a 404 submitted
 * to a crawler. The WordPress plugin's guard 15 is the same rule.
 */
export function wixSitemapEntries(args: {
  resolution: AtlasSitemapResolution
  /** No slashes, as the Install tab validated it. */
  prefix: string
  /** The site's hosts: its domain and www twin (`siteHosts`). */
  hosts: readonly string[]
}): AtlasWixSitemapEntry[] {
  const { resolution, prefix, hosts } = args

  const entries: AtlasWixSitemapEntry[] = []
  for (const url of resolution.urls) {
    if (!hosts.includes(URL.parse(url.loc)?.host ?? '')) continue
    entries.push({
      url: `/${prefix}${url.route}`,
      // An empty `title` renders as a blank row in Wix's own sitemap.
      title: resolution.titleByRoute.get(url.route) ?? url.route,
      lastmod: url.lastmod,
    })
  }
  return entries
}
