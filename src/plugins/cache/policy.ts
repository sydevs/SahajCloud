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
 * ## Per-collection TTLs (built-in REST reads)
 *
 * Clients only ever read published docs (`createAccessConfig` constrains
 * `clients` reads to `_status: published`), so anything cacheable here is
 * published-only. TTL is the invalidation backstop on the Free plan (no tag
 * purge); `cachePlugin`'s purge-on-write covers the Enterprise path. Values are
 * chosen conservatively against each collection's edit frequency (#555):
 *
 * | Collection                                     | `s-maxage` | Rationale                         |
 * | ---------------------------------------------- | ---------- | --------------------------------- |
 * | `audiences`, `events`, `pages`                 | 300s       | targeting/schedule/content churn  |
 * | `meditations`, `lectures`, `songs`, `app-cards`, `regions` | 600s | content, edited occasionally      |
 * | `images`, `albums`                             | 1800s      | media rarely changes; high volume |
 */

/** Options for a public, edge-cacheable client read. */
export interface PublicReadCacheOptions {
  /** Shared (edge) cache TTL in seconds; also used as the browser `max-age`. */
  sMaxAge: number
  /** Optional `stale-while-revalidate` window (seconds) for smoother edge refresh. */
  staleWhileRevalidate?: number
  /**
   * `Cache-Tag` values for tag-based purge — the source collection slugs a
   * response is built from. Honoured by Cloudflare Enterprise's purge-by-tag
   * (see `cachePlugin`'s write hooks); on other plans the TTL is the
   * invalidation path.
   */
  tags?: string[]
}

/**
 * Built-in Payload REST collection reads that are edge-cacheable: `GET
 * /api/<slug>` (list) and `GET /api/<slug>/<id>` (findByID). Each is tagged with
 * its own slug so a write to that collection purges it. Collections **not** in
 * this map stay `DYNAMIC`.
 */
export const CACHEABLE_READ_SLUGS = {
  audiences: { sMaxAge: 300, tags: ['audiences'] },
  events: { sMaxAge: 300, tags: ['events'] },
  pages: { sMaxAge: 300, tags: ['pages'] },
  meditations: { sMaxAge: 600, tags: ['meditations'] },
  lectures: { sMaxAge: 600, tags: ['lectures'] },
  songs: { sMaxAge: 600, tags: ['songs'] },
  'app-cards': { sMaxAge: 600, tags: ['app-cards'] },
  regions: { sMaxAge: 600, tags: ['regions'] },
  images: { sMaxAge: 1800, tags: ['images'] },
  albums: { sMaxAge: 1800, tags: ['albums'] },
} satisfies Record<string, PublicReadCacheOptions>

/**
 * Custom (shaped/passthrough) client endpoints — TTLs centralized here so every
 * cacheable read's policy lives in one place (#555). Each endpoint's handler
 * passes the matching entry to {@link publicReadCacheHeaders}. Multi-collection
 * `tags` reflect the collections a shaped response actually joins, so any of
 * their writes purge it.
 */
export const CUSTOM_READS = {
  /** `GET /api/audiences/for-user` */
  audiencesForUser: { sMaxAge: 300, tags: ['audiences'] },
  /** `GET /api/app-cards/for-audience` */
  appCardsForAudience: { sMaxAge: 600, tags: ['app-cards', 'audiences'] },
  /** `GET /api/lectures/for-audience` */
  lecturesForAudience: { sMaxAge: 600, tags: ['lectures', 'audiences'] },
  /** `GET /api/events/geojson` */
  eventsGeojson: { sMaxAge: 300, tags: ['events', 'regions'] },
  /** `GET /api/meditations/:id/songs` */
  meditationSongs: { sMaxAge: 600, tags: ['songs', 'meditations'] },
  /** `GET /api/lectures/:id/related-meditations` */
  lectureRelatedMeditations: { sMaxAge: 600, tags: ['meditations', 'lectures'] },
  /** `GET /api/meditations/:id/related-lectures` */
  meditationRelatedLectures: { sMaxAge: 600, tags: ['lectures', 'meditations'] },
} satisfies Record<string, PublicReadCacheOptions>

/**
 * Collections whose writes purge the edge cache — the union of every `Cache-Tag`
 * emitted across the built-in and custom reads above. Deriving it keeps the
 * purge graph in lockstep with what is actually cached: add a collection to
 * `CACHEABLE_READ_SLUGS` (or a tag to a `CUSTOM_READS` entry) and its writes
 * start purging automatically. Purge itself is best-effort and a no-op unless
 * `CLOUDFLARE_ZONE_ID` + `CLOUDFLARE_CACHE_PURGE_TOKEN` are set.
 */
export const PURGE_COLLECTION_SLUGS: ReadonlySet<string> = new Set(
  [...Object.values(CACHEABLE_READ_SLUGS), ...Object.values(CUSTOM_READS)].flatMap(
    (policy) => policy.tags ?? [],
  ),
)

/**
 * Live-preview secret header. Mirrors `PREVIEW_SECRET_HEADER` in
 * `src/lib/utilities/previewSecret.ts` — duplicated here (a stable protocol
 * header name) so this module stays Edge-safe; the util validates the secret
 * value server-side, the middleware only needs the header's presence.
 */
export const PREVIEW_SECRET_HEADER = 'x-sahajcloud-preview-secret'

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
export function buildCacheHeaders(
  opts: PublicReadCacheOptions & { preview?: boolean },
): Record<string, string> {
  if (opts.preview) {
    return { 'Cache-Control': 'private, no-store' }
  }

  const swr = opts.staleWhileRevalidate
    ? `, stale-while-revalidate=${opts.staleWhileRevalidate}`
    : ''
  const headers: Record<string, string> = {
    'Cache-Control': `public, max-age=${opts.sMaxAge}, s-maxage=${opts.sMaxAge}${swr}`,
    Vary: 'Authorization',
  }
  if (opts.tags?.length) {
    headers['Cache-Tag'] = opts.tags.join(',')
  }
  return headers
}

/**
 * Matches a pathname against the built-in cacheable-read shapes and returns its
 * policy, or `null` if not a cacheable built-in read.
 *
 * Cacheable: `/api/<slug>` (list) and `/api/<slug>/<numericId>` (findByID) for a
 * slug in {@link CACHEABLE_READ_SLUGS}. The numeric-id guard is what keeps the
 * custom endpoints out of scope — every one of them is either `/api/<slug>/<name>`
 * (non-numeric second segment, e.g. `/for-user`, `/geojson`) or 3-segment
 * (`/:id/songs`), so none collides with a bare findByID. Those self-manage their
 * headers via {@link publicReadCacheHeaders} in-handler.
 */
export function matchCacheableRead(pathname: string): PublicReadCacheOptions | null {
  const segments = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  // ['api', slug]  or  ['api', slug, numericId]
  if (segments[0] !== 'api') return null
  const isList = segments.length === 2
  const isFindById = segments.length === 3 && /^\d+$/.test(segments[2])
  if (!isList && !isFindById) return null
  return CACHEABLE_READ_SLUGS[segments[1] as keyof typeof CACHEABLE_READ_SLUGS] ?? null
}
