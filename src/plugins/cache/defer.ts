/**
 * The one context key a bulk writer uses to invalidate the caches once instead
 * of per write.
 *
 * ⚠ **Two caches honour it, and a writer that sets it owes both.** The
 * Cloudflare purge (`./index`) and the Atlas sidebar's tag
 * (`src/lib/atlasSidebar/cache.ts`) each hang off the same `afterChange` and
 * `afterDelete` seams on `events` and `regions`, so a bulk commit creating 500
 * classes otherwise fires 500 Cloudflare calls and 500 tag busts for one
 * outcome. Deferring half of that would leave the other half as the cost it was
 * set to avoid.
 *
 * ⚠ **Deferred, not skipped.** What the flag buys is a window: between the first
 * write and the writer's own invalidation, the edge serves the shape it had
 * before. The edge TTL is the backstop if the writer dies in that window
 * (`./purge`), which is why only a writer that invalidates in a `finally`-shaped
 * step may set it.
 *
 * Dependency-free on purpose: `src/lib/atlasSidebar/cache.ts` is pulled into
 * collection hooks and a nightly job, and pulls in nothing but `next/cache`.
 */

/** The `req.context` key, spelled once so a typo cannot silently keep a purge. */
export const DEFER_CACHE_INVALIDATION = 'deferCacheInvalidation'

/** Whether this write's caller will invalidate the caches itself, once, when it finishes. */
export function defersCacheInvalidation(context: unknown): boolean {
  return (
    typeof context === 'object' &&
    context !== null &&
    (context as Record<string, unknown>)[DEFER_CACHE_INVALIDATION] === true
  )
}
