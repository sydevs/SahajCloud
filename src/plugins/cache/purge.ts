import { serverEnv } from '@/lib/env'

/**
 * Best-effort Cloudflare edge-cache purge.
 *
 * Purges by `Cache-Tag` (Cloudflare Enterprise) or by exact `files` URL. It is a
 * no-op — returning `false` — unless both `CLOUDFLARE_ZONE_ID` and
 * `CLOUDFLARE_CACHE_PURGE_TOKEN` are set, so it's inert in dev, in preview, and
 * anywhere the edge cache isn't wired up yet. It never throws: a failed purge
 * must not fail the content write that triggered it (the edge TTL is the
 * backstop invalidation).
 *
 * See `cachePlugin`'s write hooks (`index.ts`) for the callers and `./policy`
 * (`CACHEABLE_SLUGS`) for the `Cache-Tag`s these correspond to.
 */

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'
const PURGE_TIMEOUT_MS = 5_000

export interface CachePurgeInput {
  /** `Cache-Tag` values to purge (Enterprise). Takes precedence over `files`. */
  tags?: string[]
  /** Absolute URLs to purge (works on all plans). */
  files?: string[]
}

/** Minimal logger surface — `req.payload.logger` (pino) satisfies it. */
interface PurgeLogger {
  warn: (obj: Record<string, unknown>) => void
}

/** No-op fallback so a logger-less purge stays silent and never crashes. */
const NOOP_LOGGER: PurgeLogger = { warn: () => {} }

export interface PurgeDeps {
  fetchFn?: typeof fetch
  logger?: PurgeLogger
}

export async function purgeCloudflareCache(
  input: CachePurgeInput,
  { fetchFn = fetch, logger = NOOP_LOGGER }: PurgeDeps = {},
): Promise<boolean> {
  const zoneId = serverEnv.CLOUDFLARE_ZONE_ID
  const token = serverEnv.CLOUDFLARE_CACHE_PURGE_TOKEN
  if (!zoneId || !token) return false

  const body = input.tags?.length
    ? { tags: input.tags }
    : input.files?.length
      ? { files: input.files }
      : null
  if (!body) return false

  try {
    const res = await fetchFn(`${CF_API_BASE}/zones/${zoneId}/purge_cache`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PURGE_TIMEOUT_MS),
    })
    if (!res.ok) {
      logger.warn({ msg: 'Cloudflare cache purge failed', status: res.status, purge: body })
      return false
    }
    return true
  } catch (error) {
    logger.warn({
      msg: 'Cloudflare cache purge error (ignored)',
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}
