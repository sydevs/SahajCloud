import { serverEnv } from '@/lib/env'

/**
 * Best-effort invalidation of a **consumer's own** cache, for the globals it
 * keeps a second copy of (#710).
 *
 * The Cloudflare edge cache is the one invalidation point every consumer
 * shares, and `purgeCloudflareCache` covers it. Only WeMeditateWeb holds a
 * second copy: a read-through Cloudflare KV layer at 24h for `web-config:*` and
 * `web-translations:*` (`WeMeditateWeb/server/kv-cache.ts`). A tag purge cannot
 * reach it, so an edit to a `wm-web-*` global would keep serving for up to a day
 * after the edge went cold.
 *
 * **The consumer owns its own keys.** We POST a slug and it decides which of its
 * entries that invalidates — it owns `generateCacheKey` and its own locale set.
 * Hard-coding WeMeditateWeb's key format here was the alternative, and a silent
 * mismatch in it would look exactly like a working purge.
 *
 * SahajAtlasWeb needs nothing: its only cache beyond the edge is an in-memory
 * React Query window per browser session, which a reload clears.
 *
 * Inert without both env vars, exactly like `purgeCloudflareCache` — so this is
 * a no-op in dev, in preview, and until WeMeditateWeb ships the endpoint.
 */

const REVALIDATE_TIMEOUT_MS = 5_000

/**
 * Globals WeMeditateWeb caches in KV. `wm-app-*` and `sy-atlas-*` are absent
 * because no consumer of those keeps a second copy — a write to one purges the
 * edge and nothing else. Keep this narrow: a slug here costs a request on every
 * write of that global.
 */
export const CONSUMER_CACHED_GLOBALS: ReadonlySet<string> = new Set([
  'wm-web-config',
  'wm-web-translations',
])

/** Minimal logger surface — `req.payload.logger` (pino) satisfies it. */
interface RevalidateLogger {
  warn: (obj: Record<string, unknown>) => void
}

const NOOP_LOGGER: RevalidateLogger = { warn: () => {} }

export interface RevalidateDeps {
  fetchFn?: typeof fetch
  logger?: RevalidateLogger
}

/**
 * Ask WeMeditateWeb to drop its KV copies of `globalSlug`.
 *
 * Returns `false` without a request when the slug is not one WeMeditateWeb
 * caches, or when either env var is unset. Never throws — a failed
 * revalidation must not fail the editor's save, and the consumer's own TTL is
 * the backstop.
 */
export async function revalidateConsumerCaches(
  globalSlug: string,
  { fetchFn = fetch, logger = NOOP_LOGGER }: RevalidateDeps = {},
): Promise<boolean> {
  if (!CONSUMER_CACHED_GLOBALS.has(globalSlug)) return false

  const url = serverEnv.WEMEDITATE_REVALIDATE_URL
  const secret = serverEnv.WEMEDITATE_REVALIDATE_SECRET
  if (!url || !secret) return false

  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ globals: [globalSlug] }),
      signal: AbortSignal.timeout(REVALIDATE_TIMEOUT_MS),
    })
    if (!res.ok) {
      logger.warn({
        msg: 'Consumer cache revalidation failed',
        status: res.status,
        global: globalSlug,
      })
      return false
    }
    return true
  } catch (error) {
    logger.warn({
      msg: 'Consumer cache revalidation error (ignored)',
      global: globalSlug,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
