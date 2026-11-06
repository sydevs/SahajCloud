import type { JsonLdGraph, JsonLdNode } from '../seo/jsonLd'
import type { AtlasSeoDocument } from '../seo/seoDocument'
import type { AtlasSitemapResolution } from '../sitemap/resolve'

import { PROBE_SEGMENT_PREFIX } from '@/lib/embedVerification/verifyEmbed'
import type { LocaleCode } from '@/lib/locales'
import { baseLanguage, DEFAULT_LOCALE, isValidLocale, LOCALES } from '@/lib/locales'

import { parseAtlasRoute } from '../seo/atlasRoute'
import { wixBodyHtml } from './wixBody'

/**
 * Turn one `AtlasSeoDocument` into the answer a Wix Velo router can hand to
 * `ok()` / `redirect()` / `notFound()` (#1055).
 *
 * **A serializer, never a second resolver.** Every fact here is read off the
 * document `resolveAtlasSeo` already built, so the Wix page's `<title>`,
 * canonical and body are the same ones WordPress and WeMeditateWeb get. The
 * failure this shape exists to avoid is the one #645 and #650 both describe: a
 * host that resolves routes itself ends up with a `<head>` describing a
 * different document than its body.
 *
 * **Why Wix needs its own shape at all, when the others share one.** Three
 * differences, none of them cosmetic, and each would break a current reader if
 * `/api/atlas/seo` changed to match:
 *
 * - `jsonLd` is a pre-escaped **string** there, because the WordPress plugin
 *   echoes it raw into a `<script>`. Wix serializes `structuredData` itself, so
 *   it needs objects, and handing it a string would publish a quoted blob.
 * - No HTML crosses `/api/atlas/seo`. Wix's only body sink is
 *   `$w('#…').html`, so the markup has to be built here.
 * - `description` and `robots` must be `metaTags` rows. Wix's renderer reads no
 *   top-level `description` or `noIndex`, so the other shape publishes neither.
 */

/**
 * `GET /api/atlas/wix/route` success body — always a 200 at the HTTP layer.
 *
 * ⚠ **`status` is the answer about the *page*, not about this request.** The
 * router has to render something for every path Wix hands it, so a 404 arrives
 * as a 200 carrying `status: 404` and the router calls `notFound()`. An HTTP 404
 * here would be indistinguishable from the endpoint being gone, which is the
 * case the router must degrade for rather than propagate.
 */
export type AtlasWixRouteResponse = {
  /** `200` renders, `301` redirects to `redirect`, `404` is `notFound()`. */
  status: 200 | 301 | 404
  /**
   * The **atlas route** to redirect to on a `301` — `/gb/london`, never a full
   * URL and never prefixed. The router owns its own prefix, so it composes
   * `/${prefix}${redirect}`; a URL from us would send a visitor off-site
   * whenever the canonical names another client's domain. `null` otherwise.
   */
  redirect: string | null
  /** In the shape `ok()` takes. */
  head: {
    /** Ready for `<title>`, already plain text. */
    title: string
    /**
     * `name` for a standard meta, `property` for an Open Graph one — never both.
     * **`description` and `robots` are here and nowhere else**: Wix's renderer
     * honours no top-level copy, so the page would publish with neither.
     */
    metaTags: ({ name: string; content: string } | { property: string; content: string })[]
    /**
     * **Empty when the canonical is the page being asked for**, which is the
     * common case: Wix then writes the self-canonical itself, and Wix Multilingual
     * writes the `hreflang` cluster for the languages the site publishes. Writing
     * our own alongside those would give the page two canonicals.
     *
     * Non-empty only when the canonical names a different URL — a region another
     * client owns — in which case it is that canonical plus its own alternates.
     */
    links: { rel: string; href: string; hreflang?: string }[]
    /** JSON-LD as **objects** — the graph `GET /api/atlas/seo` escapes as `jsonLd`. */
    structuredData: JsonLdNode[]
  }
  /**
   * What the router hands its page through `getRouterData()`; `null` on a `301`
   * or a `404`. ⚠ `bodyHtml` is the one place the atlas SEO surface emits
   * markup, so every CMS value in it is escaped in `wixBody.tsx` — a Wix `html`
   * sink sanitizes nothing.
   */
  data: { bodyHtml: string } | null
  /** What the router should pass as `ok()`'s `cache.ttl`. */
  cacheSeconds: number
}

type WixHead = AtlasWixRouteResponse['head']

/**
 * One `WixRouterSitemapEntry`, as the router's `*_SiteMap` function returns it.
 *
 * ⚠ **`url` is relative to the site root and DOES carry the router's prefix** —
 * `/free-classes/ca/ontario` — the opposite of `AtlasWixRouteResponse.redirect`.
 * A redirect passes through the router, which composes its own prefix; a
 * sitemap entry has nothing between it and Wix, so it has to arrive as the
 * address the site serves.
 */
export type AtlasWixSitemapEntry = {
  url: string
  title: string
  /** ISO 8601 instant the document was last edited. */
  lastmod: string
}

/** What a Wix answer tells the router to cache for. Wix's own cache bounds our volume. */
export const WIX_CACHE_SECONDS = 300

/** An empty head, for the two answers that render no page. */
const EMPTY_HEAD: WixHead = { title: '', metaTags: [], links: [], structuredData: [] }

/** The host a URL names, or `null`. */
export function hostOf(url: string | null | undefined): string | null {
  return url ? (URL.parse(url)?.host ?? null) : null
}

/**
 * Which of the nineteen SEO locales a Wix language code names.
 *
 * ⚠ **Wix hands the router a language, and we answer in a locale.** The two are
 * not the same vocabulary: a Multilingual site's `request.baseUrl` ends in
 * `/fr/`, so the router reads `fr` — a bare ISO 639-1 subtag, never `pt-BR` or
 * `en-AU`. Two of our nineteen are regional variants with no bare form, so a
 * straight `isValidLocale` check would send every Portuguese and Australian
 * page to English.
 *
 * The ladder, in order:
 *
 * 1. An exact locale code, for a router configured with one (`pt-BR`).
 * 2. The first locale whose own language matches — `pt` → `pt-BR`, `en` → `en`.
 *    Declaration order in `LOCALES` decides, which is why `en` precedes
 *    `en-AU` there: a bare subtag should resolve to the unmarked variant.
 * 3. The default locale. An unknown language is not an error — the page still
 *    has to render, and English is what the widget itself falls back to.
 */
export function localeFromWixLang(lang: string | undefined): LocaleCode {
  if (!lang) return DEFAULT_LOCALE
  if (isValidLocale(lang)) return lang

  const subtag = lang.split('-')[0].toLowerCase()
  const match = LOCALES.find((locale) => baseLanguage(locale.code) === subtag)
  return match?.code ?? DEFAULT_LOCALE
}

/**
 * The route spelled the way `webPath` spells it: a leading slash, no trailing
 * one, `/` for nothing at all.
 *
 * Comparing against `seo.route` is the whole purpose, and `buildRegionPath`
 * emits exactly this shape, so normalizing the caller's string the same way is
 * what makes `requested === seo.route` mean "the host is already serving the
 * right address".
 */
export function normalizeAtlasPath(path: string): string {
  const segments = path.split('/').filter(Boolean)
  return segments.length === 0 ? '/' : `/${segments.join('/')}`
}

/**
 * Is this the routing probe's own URL?
 *
 * ⚠ **It has to be answered as the root, with `noindex`, or `probeRouting`
 * fails against the real 404** (#644). The probe loads `<mount>/<token>` and
 * demands the readiness marker there; a router that answered `notFound()`
 * would make every Wix client look like a host that does not serve the subtree,
 * and demote it to `?atlas=` URLs three probes later. The control render at
 * `<origin>/<token>` is unaffected — it is outside the router's prefix, so Wix
 * still 404s it, which is what the probe needs from it.
 *
 * Matched anywhere in the path rather than only at the end: the token is one
 * segment appended to the mount, and a mount with its own trailing segments is
 * a shape `routingProbeUrls` allows.
 */
export function isProbePath(path: string): boolean {
  return path
    .split('/')
    .filter(Boolean)
    .some((segment) => segment.toLowerCase().startsWith(PROBE_SEGMENT_PREFIX))
}

/**
 * What the host should do about the difference between the route it asked for
 * and the route the document actually lives at.
 *
 * - **`exact`** — the same address. Nothing to say.
 * - **`view`** — the same document, reached through one of the widget's own view
 *   segments (`/gb/london/calendar`, `/gb/london/1204/register`, or a bare
 *   `/search` of the root). A real page a visitor may be linked to, so it
 *   renders — and publishes the document's canonical, so a crawler folds the two
 *   together itself. Redirecting would break the deep links the widget writes.
 * - **`moved`** — a different address for the same document: a legacy prefix
 *   (`/events/1204`), stale ancestry, or a re-slugged country (#556). Nothing
 *   links there on purpose, so a `301` is both cheaper for a crawler and
 *   correct.
 *
 * The test is the **non-view segments**, because that is exactly what
 * `parseAtlasRoute` keys a document on. Two routes with the same key segments
 * differ only by views; two with different key segments name the address
 * differently.
 */
export type RouteRelation = 'exact' | 'view' | 'moved'

export function routeRelation(requested: string, resolved: string): RouteRelation {
  if (requested === resolved) return 'exact'

  // `parseAtlasRoute` drops the reserved words; running the requested path
  // through the same parser is what keeps this from being a second copy of that
  // list. A route it refuses never reaches here.
  const keyOf = (path: string): string =>
    path
      .split('/')
      .filter(Boolean)
      .filter((segment) => parseAtlasRoute(`/${segment}`)?.kind !== 'root')
      .join('/')

  return keyOf(requested) === keyOf(resolved) ? 'view' : 'moved'
}

/**
 * The JSON-LD graph as the array of nodes Wix publishes.
 *
 * ⚠ **The same graph `/api/atlas/seo` serializes, never a second one.** Building
 * a second graph here would be the one thing this whole endpoint exists to
 * avoid: two JSON-LD documents for one route, free to disagree the day an
 * `@type` changes. Reading it off {@link AtlasSeoDocument} is what makes that
 * structural — before #1055's review this parsed `jsonLd` back out of its own
 * escaped string, which was provably lossless and still a surface parsing its
 * own output.
 *
 * A `@graph` is flattened, because Wix takes an array of nodes and would
 * otherwise publish one node wrapping all of them.
 */
export function wixStructuredData(graph: JsonLdGraph): JsonLdNode[] {
  // Each node carries the context forward: Wix emits one `<script>` per entry,
  // and a node with no `@context` is not a schema.org document.
  return graph['@graph'].map((node) => ({ '@context': graph['@context'], ...node }))
}

/**
 * The `<meta>` rows for one answer.
 *
 * `description` is omitted rather than sent empty — a region has none in the
 * CMS, and an empty `<meta name="description">` is a claim that the page has no
 * summary rather than that we have not written one.
 */
export function wixMetaTags(seo: AtlasSeoDocument, noindex: boolean): WixHead['metaTags'] {
  const tags: WixHead['metaTags'] = []
  if (seo.description) tags.push({ name: 'description', content: seo.description })
  // `nofollow` is deliberately absent: the body's links are the region tree, and
  // an unindexed language's page should still pass a crawler through to the one
  // that is indexed.
  if (noindex) tags.push({ name: 'robots', content: 'noindex' })
  for (const [property, content] of Object.entries(seo.openGraph)) {
    tags.push({ property, content })
  }
  return tags
}

/**
 * The `<link>` rows, or none.
 *
 * `selfCanonical` is the caller's judgement, not ours to re-derive: only the
 * router knows the URL Wix is rendering. See {@link AtlasWixRouteResponse.head}.
 */
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

/** The answer for a path that is not a route, or names nothing. */
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
 * ⚠ **Only a `moved` route is a 301**, never every route that normalized.
 * `routeRelation` is what tells the two apart, and the distinction is not
 * cosmetic: `/gb/london/calendar` and `/search` normalize away too, and both are
 * addresses the **widget itself writes** into the host's URL. Redirecting them
 * would break the widget's own navigation on every Wix site, while a legacy
 * prefix or a re-slugged country is an address nothing links on purpose and is
 * cheaper for a crawler to be redirected from. A view renders and publishes the
 * document's canonical instead, so a crawler folds the two together itself.
 */
export function wixRouteAnswer(args: {
  seo: AtlasSeoDocument
  /** What the caller's route and the document's route have to do with each other. */
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
 * Turn one client's owned atlas URLs into the entries a Velo `*_SiteMap`
 * function returns (#1055).
 *
 * Two rules, and both are about what a sitemap is *for*:
 *
 * - **This host only.** `GET /api/atlas/sitemap` publishes absolute canonical
 *   URLs, and a client's answer can legitimately contain another host's — a
 *   mis-set `site` address, or a key shared between two sites. Wix resolves a
 *   `WixRouterSitemapEntry.url` against the site's own domain, so a foreign
 *   canonical would be republished as this site's page. That is the same guard
 *   the WordPress plugin numbers 15, and the reason it is a guard rather than a
 *   filter nobody notices: an entry dropped here is a page in nobody's sitemap,
 *   which is better than a 404 submitted to a crawler on purpose.
 * - **Relative, with the prefix.** See {@link AtlasWixSitemapEntry}.
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
