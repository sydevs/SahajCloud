import type { RoutingMode } from '@/lib/clients/canonical'

/**
 * The canonical Atlas URL builder — two shapes, no hash.
 *
 * ```
 * path :  {origin}{mount}{webPath}
 *         https://wemeditate.com/map/nl/amsterdam/1204
 *
 * query:  {origin}{mount}{?|&}atlas={webPath}
 *         https://sahajayoga.nl/locatelessons/?atlas=/nl/amsterdam/1204
 *         https://host.example/?p=42&atlas=/nl/amsterdam/1204
 * ```
 *
 * Pure and env-free so the contract can be pinned by `atlas-url-contract.json`,
 * the fixture SahajCloud, SahajAtlasWeb and WeMeditateWeb all assert against —
 * three repos composing the same URL from the same parts is exactly the kind of
 * agreement that rots silently.
 */

/**
 * Where a canonical URL is rooted: the origin of the page the widget is
 * embedded on, the path of that page, and how the widget expresses its state.
 *
 * Named for the role rather than the source, because two unrelated things fill
 * it — a client that owns its region (`origin` built from `canonical.domain`)
 * and the We Meditate fallback (`origin` from `WEMEDITATE_WEB_URL`).
 */
export interface CanonicalTarget {
  /** Scheme + host — e.g. `https://sahajayoga.nl`. A trailing slash is trimmed. */
  origin: string
  /** The page the widget is mounted on. May carry a query string. */
  mount: string
  routing: RoutingMode
}

/** The query parameter the widget reads its state from in `query` routing. */
export const ATLAS_QUERY_PARAM = 'atlas'

/**
 * A verified host + mount + routing, as a {@link CanonicalTarget}.
 *
 * Named for the role rather than the caller, because two callers fill it from
 * different records: the resolver, from a client's
 * `canonical.verification.verified`, and the admin picker, from the embed an
 * operator is about to choose. Both must produce the same URL — a picker that
 * previews a shape the resolver does not emit is worse than no preview.
 *
 * The scheme is stated here, not carried: `domain` is a bare host by
 * construction (`CANONICAL_DOMAIN_PATTERN`), and a canonical URL a crawler
 * should follow is https — so it is ours to state rather than an operator's to
 * mistype.
 */
export function canonicalTargetForHost(host: {
  domain: string
  mount?: string | null
  routing?: RoutingMode | null
}): CanonicalTarget {
  return {
    origin: `https://${host.domain}`,
    mount: host.mount ?? '/',
    routing: host.routing ?? 'query',
  }
}

/**
 * A path we are willing to put in a URL: one or more non-empty segments, and
 * no query, fragment or whitespace.
 *
 * Deliberately charset-agnostic rather than pinned to the slug alphabet — the
 * *stricter* `^(\/[a-z0-9-]+)+$` assumption (region slugs are transliterated to
 * `[a-z0-9-]`, event ids are numeric, so emitting the path raw is a no-op) is
 * asserted in the unit test, where widening the slug rules fails loudly instead
 * of silently changing what this builder accepts.
 *
 * The non-empty-segment requirement is what stops a blank slug anywhere in a
 * region's ancestry emitting `//` inside a canonical URL.
 */
const EMITTABLE_PATH = /^(\/[^/?#\s]+)+$/

/** Trim trailing slashes so joining can't produce `//`. */
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

/**
 * The fixed part of a canonical URL — everything before the region path.
 *
 * This, rather than the whole URL, is the primitive because `publicUrlFields`
 * composes `webUrl` as `base + webPath`. Both shapes can express themselves
 * that way precisely *because* the path is emitted raw and always last: `query`
 * routing simply ends its base at `…?atlas=`. So the collection fields and
 * {@link buildCanonicalUrl} share one definition instead of two that could drift.
 *
 * Returns `null` when the parts cannot make a valid URL — an incomplete owner
 * record or a malformed mount. Never a broken URL, and **never a fragment**:
 * hash routing is gone from the widget with no back-compat, so nothing here may
 * emit `#!`.
 */
export function canonicalUrlBase(target: CanonicalTarget): string | null {
  const origin = trimTrailingSlash(target.origin ?? '')
  if (!origin || /[?#\s]/.test(origin)) return null

  const mount = target.mount ?? '/'
  // The host is stated once, in `origin`; a mount that isn't a path would join
  // into a URL resolving nowhere. A fragment is refused outright.
  if (mount !== '' && !mount.startsWith('/')) return null
  if (mount.includes('#')) return null

  if (target.routing === 'path') {
    // A mount carrying a query string has no room for more path segments —
    // they would land after the `?` and read as part of the query value. That
    // combination is a misconfiguration, not something to paper over.
    if (mount.includes('?')) return null
    return `${origin}${trimTrailingSlash(mount)}`
  }

  // `query`: the mount is the page itself, so its trailing slash is preserved —
  // `/locatelessons/` is a different URL from `/locatelessons`, and the mount
  // records which one the embed actually lives on.
  const page = mount === '' ? '/' : mount
  const separator = page.includes('?') ? '&' : '?'
  return `${origin}${page}${separator}${ATLAS_QUERY_PARAM}=`
}

/**
 * Compose a full canonical URL, or `null` when either the target or the path
 * cannot make one.
 *
 * `webPath` is emitted **raw**, not percent-encoded — see {@link EMITTABLE_PATH}.
 */
export function buildCanonicalUrl(target: CanonicalTarget, webPath: string): string | null {
  if (typeof webPath !== 'string' || !EMITTABLE_PATH.test(webPath)) return null
  const base = canonicalUrlBase(target)
  return base === null ? null : `${base}${webPath}`
}
