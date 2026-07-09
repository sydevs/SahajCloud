/**
 * Next.js middleware — the single edge-cache choke point for built-in Payload
 * REST collection reads (`GET /api/<collection>`). See
 * `@/plugins/cachePlugin/middleware` for the decision logic and rationale.
 *
 * Deep-imports the plugin's Edge-safe `./middleware` (not the barrel): the
 * `@/plugins/cachePlugin` barrel exports the Payload plugin + purge, which pull
 * `serverEnv`/Payload — server-only code that must not enter the Edge bundle.
 * The imported module depends only on `next/server` + the pure policy.
 */
import type { NextRequest } from 'next/server'

import { handleCacheMiddleware } from '@/plugins/cachePlugin/middleware'

export function middleware(request: NextRequest) {
  return handleCacheMiddleware(request)
}

export const config = {
  // Run on every REST API path; the handler no-ops for anything that isn't a
  // cacheable client read (writes, custom endpoints, non-cacheable collections).
  matcher: '/api/:path*',
}
