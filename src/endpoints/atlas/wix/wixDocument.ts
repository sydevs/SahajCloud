import type { RouteRelation } from './wixRoute'
import type {
  AtlasWixHead,
  AtlasWixLink,
  AtlasWixMetaTag,
  AtlasWixRouteResponse,
} from '../../responseTypes'
import type { JsonLdGraph, JsonLdNode } from '../seo/jsonLd'
import type { AtlasSeoDocument } from '../seo/seoDocument'

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

/** What a Wix answer tells the router to cache for. Wix's own cache bounds our volume. */
export const WIX_CACHE_SECONDS = 300

/** An empty head, for the two answers that render no page. */
const EMPTY_HEAD: AtlasWixHead = { title: '', metaTags: [], links: [], structuredData: [] }

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
export function wixMetaTags(seo: AtlasSeoDocument, noindex: boolean): AtlasWixMetaTag[] {
  const tags: AtlasWixMetaTag[] = []
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
 * router knows the URL Wix is rendering. See {@link AtlasWixHead.links}.
 */
export function wixLinks(seo: AtlasSeoDocument, selfCanonical: boolean): AtlasWixLink[] {
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
    data: { type: seo.type, route: seo.route, bodyHtml: wixBodyHtml(seo) },
    cacheSeconds: WIX_CACHE_SECONDS,
  }
}
