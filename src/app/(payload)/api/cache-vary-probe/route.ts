import { createHash, randomUUID } from 'crypto'

import { serverEnv } from '@/lib/env'

/**
 * TEMPORARY diagnostic — `GET /api/cache-vary-probe`.
 *
 * Tests whether Cloudflare honours `Vary: Authorization` for per-client edge
 * caching on a non-Enterprise plan (see #550). Dormant (404) unless
 * `CACHE_VARY_PROBE=on`, so merging/deploying it is inert until the test window.
 *
 * It exposes no secrets even if the cache mis-shares: the body is a random
 * `nonce` plus a truncated **hash** of the `Authorization` header (never the raw
 * key). `nonce` is regenerated on every origin execution, so:
 *   - two responses with the SAME nonce came from the SAME cache variant;
 *   - `authFingerprint` reveals which Authorization value populated the variant
 *     that served a given request.
 *
 * Test protocol: with a Cache Rule making this path eligible + Vary configured
 * `{ default: bypass, headers: { authorization: passthrough } }`, request it
 * with two distinct `Authorization` values. Per-client isolation ⇒ each value
 * gets its own nonce and its first hit is a MISS; a shared/leaking cache ⇒ the
 * second value HITs and returns the first value's nonce + fingerprint.
 *
 * Remove this route (and the `CACHE_VARY_PROBE` env var) once the test concludes.
 */

// Every origin hit must be fresh (a new nonce) — never serve from Next's cache.
export const dynamic = 'force-dynamic'

export function GET(request: Request): Response {
  if (serverEnv.CACHE_VARY_PROBE !== 'on') {
    return new Response('Not Found', { status: 404 })
  }

  const auth = request.headers.get('authorization') ?? ''
  const authFingerprint = auth
    ? createHash('sha256').update(auth).digest('hex').slice(0, 12)
    : 'anonymous'

  const body = {
    nonce: randomUUID(),
    authFingerprint,
    servedAtUtc: new Date().toISOString(),
    note: 'Vary:Authorization cache probe (#550) — remove after testing',
  }

  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      // max-age=0 keeps browsers revalidating; s-maxage lets the shared (edge)
      // cache hold it. The Cache Rule is what actually makes it eligible.
      'Cache-Control': 'public, max-age=0, s-maxage=120',
      Vary: 'Authorization',
    },
  })
}
