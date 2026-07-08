import type { PayloadRequest } from 'payload'

import { hasValidPreviewSecret } from '@/lib/utilities/previewSecret'

export interface PublicReadCacheOptions {
  /** Shared (edge) cache TTL in seconds; also used as the browser `max-age`. */
  sMaxAge: number
  /** Optional `stale-while-revalidate` window (seconds) for smoother edge refresh. */
  staleWhileRevalidate?: number
  /**
   * `Cache-Tag` values for tag-based purge — typically the source collection
   * slugs a response is built from (e.g. `['meditations', 'lectures']`).
   * Honoured by Cloudflare Enterprise's purge-by-tag; ignored on other plans,
   * where the TTL above is the invalidation path. See {@link publicReadCacheHeaders}.
   */
  tags?: string[]
}

/**
 * Response headers for a **public, edge-cacheable client read**.
 *
 * A valid live-preview request (it serves drafts, see `hasValidPreviewSecret`)
 * gets `private, no-store` so drafts are never cached — anything else gets
 * `public` cache headers plus an optional `Cache-Tag`.
 *
 * Client requests carry an `Authorization` header, which Cloudflare treats as
 * private and bypasses by default (`cf-cache-status: DYNAMIC`). These headers do
 * nothing on their own — pair them with a Cloudflare **Cache Rule** that marks
 * the public GET endpoints "Eligible for cache". The emitted `Vary: Authorization`
 * makes Cloudflare key a separate cached variant per API key (rule
 * `vary.authorization = passthrough`), so one client is never served another
 * client's cached response — this works on all plans, including Free (verified in
 * #550). The rule's `vary.default` must be `passthrough`, **not** `bypass`: Next.js
 * also stamps `rsc` / `next-router-*` / `Sec-CH-Prefers-Color-Scheme` onto `Vary`,
 * and a `bypass` default would bypass on those before `Authorization` is even
 * considered. The preview branch here is defense-in-depth alongside a rule
 * condition that bypasses cache when the preview-secret header is present.
 */
export function publicReadCacheHeaders(
  req: PayloadRequest,
  { sMaxAge, staleWhileRevalidate, tags }: PublicReadCacheOptions,
): Record<string, string> {
  if (hasValidPreviewSecret(req)) {
    return { 'Cache-Control': 'private, no-store' }
  }

  const swr = staleWhileRevalidate ? `, stale-while-revalidate=${staleWhileRevalidate}` : ''
  const headers: Record<string, string> = {
    'Cache-Control': `public, max-age=${sMaxAge}, s-maxage=${sMaxAge}${swr}`,
    // Cache a separate edge variant per API key (see the doc block above). Some
    // of these reads are per-client (e.g. the geojson feed runs `overrideAccess:
    // false`), so a shared cache key could leak — `Vary` keeps clients isolated.
    Vary: 'Authorization',
  }
  if (tags && tags.length > 0) {
    headers['Cache-Tag'] = tags.join(',')
  }
  return headers
}
