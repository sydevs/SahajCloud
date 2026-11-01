import type { AtlasRouteTarget } from '../seo/atlasRoute'

import { PROBE_SEGMENT_PREFIX } from '@/lib/embedVerification/verifyEmbed'

import { parseAtlasRoute } from '../seo/atlasRoute'

/**
 * The route arithmetic a Wix answer needs and `/api/atlas/seo` does not.
 *
 * That endpoint answers one question — what document is this route *of* — and a
 * stale or view-bearing route resolves on purpose, with the normalized `route`
 * in the answer for the host to act on. WordPress acts on it by publishing the
 * canonical. A Wix router can do better, because it owns the request: it can
 * `redirect()`. So this module is what tells the two cases apart.
 */

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

/** Re-exported so the handler parses and relates through one import. */
export { parseAtlasRoute }
export type { AtlasRouteTarget }
