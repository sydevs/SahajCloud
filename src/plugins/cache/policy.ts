/**
 * Edge-cache policy — the single source of truth for **which** client reads are
 * cacheable and **for how long**, plus the pure header builder shared by both
 * application surfaces (the Next.js middleware for built-in REST reads and the
 * in-handler decorator for the custom endpoints).
 *
 * This module is **Edge-safe**: it imports nothing (no `serverEnv`, no Payload,
 * no Node APIs), so `src/middleware.ts` can pull it into the Edge runtime bundle
 * via `@/plugins/cache/middleware` without dragging server-only code along.
 * Keep it dependency-free.
 *
 * ## Per-slug TTLs
 *
 * {@link CACHE_TTLS} is the one place a cacheable slug is listed and the one
 * place its TTL lives, for collections and globals alike. Every other export
 * here is derived from it, so the cacheable set and the purge set cannot drift.
 * A built-in REST read uses its own slug's TTL; a custom endpoint's TTL is
 * *derived* as the lowest TTL among the collections it reads (see
 * {@link resolveTtl}), so it never outlives its freshest input.
 *
 * Clients only ever read published docs (`createAccessConfig` constrains
 * `clients` reads to `_status: published`), so anything cacheable here is
 * published-only. `cachePlugin`'s purge-on-write is the primary invalidation and
 * the TTL is its backstop for when a purge call fails or the credentials are
 * unset. Values are chosen conservatively against edit frequency (#555): 300s
 * for targeting, schedule and content churn, 600s for content edited
 * occasionally, 1800s for media.
 */

/** Default edge TTL (`s-maxage`, seconds) for a cacheable read; per-collection overrides below. */
export const DEFAULT_SMAXAGE = 600

/**
 * Every cacheable slug → its edge TTL (`s-maxage`, seconds), split by the shape
 * of the read it names. These keys are the single source of truth for **both**
 * which built-in REST reads may be cached and which writes purge on change; a
 * custom endpoint's TTL is derived from `collections` by {@link resolveTtl}.
 *
 * The two halves stay separate because they are two different URL shapes —
 * `/api/<slug>` against `/api/globals/<slug>` — and only `collections` slugs may
 * be tagged by a custom endpoint. A slug in neither half stays `DYNAMIC`. Slugs
 * at {@link DEFAULT_SMAXAGE} still list it explicitly so both sets stay
 * self-evident.
 *
 * `globals` holds the client-read configuration and translation globals, each
 * fetched on boot by a widget or site (#710). ⚠ **`wm-app-status` is
 * deliberately absent.** It is an operator readiness report, read in the admin
 * over cookie auth, and it carries computed fields. `DYNAMIC` is the fail-safe
 * direction. Add a global here only when a client genuinely reads it and its
 * contents are published-only.
 */
export const CACHE_TTLS = {
  collections: {
    meditations: DEFAULT_SMAXAGE,
    lectures: DEFAULT_SMAXAGE,
    songs: DEFAULT_SMAXAGE,
    'app-cards': DEFAULT_SMAXAGE,
    regions: DEFAULT_SMAXAGE,
    'user-choices': DEFAULT_SMAXAGE,
    audiences: 300,
    events: 300,
    pages: 300,
    images: 1800,
    albums: 1800,
  },
  globals: {
    'wm-web-config': DEFAULT_SMAXAGE,
    'wm-web-translations': DEFAULT_SMAXAGE,
    'wm-app-config': DEFAULT_SMAXAGE,
    'wm-app-translations': DEFAULT_SMAXAGE,
    'sy-atlas-config': DEFAULT_SMAXAGE,
    'sy-atlas-translations': DEFAULT_SMAXAGE,
  },
} satisfies { collections: Record<string, number>; globals: Record<string, number> }

/**
 * A collection slug known to {@link CACHE_TTLS} — the only slugs a cacheable read
 * may tag. Typing the {@link publicReadCacheHeaders} `tags` param to this catches
 * typo'd slugs at compile time and enforces that a custom endpoint only tags
 * collections that are themselves cacheable (so the purge graph stays complete).
 */
export type CacheableSlug = keyof typeof CACHE_TTLS.collections

/**
 * Cacheable collection slugs — hence also the set whose writes purge the edge
 * cache. Every custom endpoint reads only collections that are themselves
 * cacheable built-in reads, so this set covers the purge graph too.
 */
export const CACHEABLE_SLUGS: ReadonlySet<string> = new Set(Object.keys(CACHE_TTLS.collections))

/**
 * Cacheable global slugs — likewise the set whose writes purge. The `Cache-Tag`
 * is the global's own slug, exactly as it is for a collection. The two
 * namespaces cannot collide: every cacheable global is `wm-*` or `sy-*`, and no
 * collection slug takes either prefix.
 */
export const CACHEABLE_GLOBALS: ReadonlySet<string> = new Set(Object.keys(CACHE_TTLS.globals))

/**
 * Live-preview secret header. Mirrors `PREVIEW_SECRET_HEADER` in
 * `src/lib/utilities/previewSecret.ts` — duplicated here (a stable protocol
 * header name) so this module stays Edge-safe; the util validates the secret
 * value server-side, the middleware only needs the header's presence.
 */
export const PREVIEW_SECRET_HEADER = 'x-sahajcloud-preview-secret'

/** TTL for a collection slug — its {@link CACHE_TTLS} entry, else {@link DEFAULT_SMAXAGE}. */
export function ttlForSlug(slug: string): number {
  return (CACHE_TTLS.collections as Record<string, number>)[slug] ?? DEFAULT_SMAXAGE
}

/** TTL for a global slug — its {@link CACHE_TTLS} entry, else {@link DEFAULT_SMAXAGE}. */
export function ttlForGlobal(slug: string): number {
  return (CACHE_TTLS.globals as Record<string, number>)[slug] ?? DEFAULT_SMAXAGE
}

/**
 * A custom endpoint's TTL is the **lowest** TTL among the collections its
 * response is built from, so it never outlives its freshest input — e.g. an
 * audience feed inherits the 300s `audiences` TTL even though `lectures` is 600s.
 */
export function resolveTtl(tags: readonly string[]): number {
  return tags.length ? Math.min(...tags.map(ttlForSlug)) : DEFAULT_SMAXAGE
}

/**
 * Response headers for a public, edge-cacheable client read — the single source
 * for the exact header strings, shared by the middleware and the in-handler
 * decorator so both surfaces emit byte-identical headers.
 *
 * A preview read (it may carry drafts) gets `private, no-store` so drafts are
 * never cached. Otherwise: `public` cache directives, `Vary: Authorization` so
 * Cloudflare keys a separate cached variant per API key (no cross-client leak;
 * pair with a Cache Rule's `vary.authorization = passthrough`), and an optional
 * `Cache-Tag`.
 */
export function buildCacheHeaders(opts: {
  sMaxAge: number
  tags?: readonly string[]
  preview?: boolean
}): Record<string, string> {
  if (opts.preview) {
    return { 'Cache-Control': 'private, no-store' }
  }

  const headers: Record<string, string> = {
    'Cache-Control': `public, max-age=${opts.sMaxAge}, s-maxage=${opts.sMaxAge}`,
    Vary: 'Authorization',
  }
  if (opts.tags?.length) {
    headers['Cache-Tag'] = opts.tags.join(',')
  }
  return headers
}

/**
 * Matches a pathname against the built-in cacheable-read shapes and returns its
 * `{ sMaxAge, tags }`, or `null` if not a cacheable built-in read.
 *
 * Cacheable:
 *
 * - `/api/<slug>` (list) and `/api/<slug>/<numericId>` (findByID) for a slug in
 *   {@link CACHEABLE_SLUGS}. The numeric-id guard keeps the custom endpoints out
 *   of scope — each is `/api/<slug>/<name>` or 3-segment — so they self-manage
 *   their headers via {@link publicReadCacheHeaders} in-handler.
 * - `/api/globals/<slug>`, exactly three segments, for a slug in
 *   {@link CACHEABLE_GLOBALS}. A versions read (`/api/globals/<slug>/versions`)
 *   carries drafts and stays `DYNAMIC`.
 */
export function matchCacheableRead(pathname: string): { sMaxAge: number; tags: string[] } | null {
  const segments = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  if (segments[0] !== 'api') return null

  // ['api', 'globals', globalSlug] — a global read, which has no list or
  // findByID form. Checked before the collection shapes below, since a
  // 3-segment path would otherwise fall through the numeric-id guard.
  if (segments[1] === 'globals') {
    if (segments.length !== 3) return null
    const globalSlug = segments[2]
    if (!CACHEABLE_GLOBALS.has(globalSlug)) return null
    return { sMaxAge: ttlForGlobal(globalSlug), tags: [globalSlug] }
  }

  // ['api', slug]  or  ['api', slug, numericId]
  const isList = segments.length === 2
  const isFindById = segments.length === 3 && /^\d+$/.test(segments[2])
  if (!isList && !isFindById) return null
  const slug = segments[1]
  if (!CACHEABLE_SLUGS.has(slug)) return null
  return { sMaxAge: ttlForSlug(slug), tags: [slug] }
}
