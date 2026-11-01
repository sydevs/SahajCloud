import type {
  AtlasSeoEventContent,
  AtlasSeoRegionContent,
  AtlasSeoResponse,
  AtlasSeoRootContent,
  AtlasWixHead,
  AtlasWixLink,
  AtlasWixMetaTag,
  AtlasWixRouteResponse,
} from '../../responseTypes'

import { escapeHtml, safeUrl } from './wixHtml'

/**
 * Turn one `AtlasSeoResponse` into the answer a Wix Velo router can hand to
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
 * The JSON-LD document as objects, parsed back out of the serialized form.
 *
 * ⚠ **Parsed, deliberately, rather than rebuilt.** `jsonLdEscape` replaces
 * `<`, `>`, `&` and the two Unicode separators with **valid JSON escapes for
 * the same characters**, so the string parses to a value deep-equal to the one
 * it was built from — its own docblock says so, and
 * `tests/unit/wix-route-shape.spec.ts` asserts it. Building a second graph here
 * would be the one thing this whole endpoint exists to avoid: two JSON-LD
 * documents for one route, free to disagree the day an `@type` changes.
 *
 * A `@graph` is flattened, because Wix takes an array of nodes and would
 * otherwise publish one node wrapping all of them. A parse failure answers `[]`
 * — structured data is an enhancement, and no page should fail to render for it.
 */
export function wixStructuredData(jsonLd: string): Record<string, unknown>[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonLd)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== 'object') return []

  const document = parsed as Record<string, unknown>
  const graph = document['@graph']
  if (!Array.isArray(graph)) return [document]

  const context = document['@context']
  // Each node carries the context forward: Wix emits one `<script>` per entry,
  // and a node with no `@context` is not a schema.org document.
  return graph
    .filter((node): node is Record<string, unknown> => Boolean(node) && typeof node === 'object')
    .map((node) => (context === undefined ? node : { '@context': context, ...node }))
}

/**
 * The `<meta>` rows for one answer.
 *
 * `description` is omitted rather than sent empty — a region has none in the
 * CMS, and an empty `<meta name="description">` is a claim that the page has no
 * summary rather than that we have not written one.
 */
export function wixMetaTags(seo: AtlasSeoResponse, noindex: boolean): AtlasWixMetaTag[] {
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
export function wixLinks(seo: AtlasSeoResponse, selfCanonical: boolean): AtlasWixLink[] {
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

/** One `<p>` per authored block, escaped. The shared half of three renderers. */
function paragraphs(content: { paragraphs?: string[] }): string {
  return (content.paragraphs ?? []).map((text) => `<p>${escapeHtml(text)}</p>`).join('')
}

/**
 * The root view's body.
 *
 * ⚠ Takes the whole answer, not just `content`: the root names no document, so
 * its heading is the page title the operator wrote, which sits at the top level
 * beside every other route's. A locale nobody has written copy for renders the
 * heading and nothing else — which is why this is decided before the `content`
 * guard in {@link wixBodyHtml} rather than after it.
 */
function rootBody(seo: Extract<AtlasSeoResponse, { type: 'root' }>): string {
  const content: AtlasSeoRootContent = seo.content ?? { paragraphs: [] }
  return `<section><h1>${escapeHtml(seo.title)}</h1>${paragraphs(content)}</section>`
}

/** An event's body: its facts, its description, its photos, its own link. */
function eventBody(content: AtlasSeoEventContent): string {
  let out = `<article><h1>${escapeHtml(content.title)}</h1>`

  if (content.schedule?.oneLine) out += `<p>${escapeHtml(content.schedule.oneLine)}</p>`
  if (content.address?.oneLine) out += `<address>${escapeHtml(content.address.oneLine)}</address>`

  out += paragraphs(content)

  for (const image of content.images ?? []) {
    const src = safeUrl(image.url)
    if (!src) continue
    out += `<img src="${escapeHtml(src)}" alt="${escapeHtml(image.alt ?? '')}" loading="lazy" />`
  }

  const website = safeUrl(content.website)
  if (website) out += `<p><a href="${escapeHtml(website)}">${escapeHtml(website)}</a></p>`

  return `${out}</article>`
}

/** A region's body: its name, its subtitle, and its classes as real links. */
function regionBody(content: AtlasSeoRegionContent): string {
  let out = `<section><h1>${escapeHtml(content.name)}</h1>`
  if (content.subtitle) out += `<p>${escapeHtml(content.subtitle)}</p>`

  const rows = (content.events ?? [])
    .filter((event) => event.title)
    .map((event) => {
      const href = safeUrl(event.url)
      const label = href
        ? `<a href="${escapeHtml(href)}">${escapeHtml(event.title)}</a>`
        : escapeHtml(event.title)
      const facts = [event.schedule, event.address].filter(Boolean).join(' · ')
      return `<li>${label}${facts ? ` — ${escapeHtml(facts)}` : ''}</li>`
    })

  if (rows.length > 0) out += `<ul>${rows.join('')}</ul>`
  return `${out}</section>`
}

/**
 * The crawlable body for one answer.
 *
 * A deliberate mirror of `sahaj_atlas_seo_children` in the WordPress plugin, so
 * the two hosts show a crawler the same page.
 */
export function wixBodyHtml(seo: AtlasSeoResponse): string {
  if (seo.type === 'root') return rootBody(seo)
  if (!seo.content) return ''
  return seo.type === 'event' ? eventBody(seo.content) : regionBody(seo.content)
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
 * **A route that normalized is a 301**, not a rendered page: the answer's own
 * `route` is the URL the host should be serving, so two addresses do not both
 * render the same document. That happens for a legacy prefix (`/events/1204`),
 * a re-slugged country (#556), and a view segment (`/gb/london/calendar`) — all
 * of which `parseAtlasRoute` resolves on purpose, and none of which should stay
 * in a crawler's index.
 */
export function wixRouteAnswer(args: {
  seo: AtlasSeoResponse
  /** The atlas route the caller asked for, normalized the same way. */
  requestedRoute: string
  noindex: boolean
  selfCanonical: boolean
}): AtlasWixRouteResponse {
  const { seo, requestedRoute, noindex, selfCanonical } = args

  if (seo.route !== requestedRoute) {
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
      structuredData: wixStructuredData(seo.jsonLd),
    },
    data: { type: seo.type, route: seo.route, bodyHtml: wixBodyHtml(seo) },
    cacheSeconds: WIX_CACHE_SECONDS,
  }
}
