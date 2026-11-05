/**
 * Next.js middleware: the Cloudflare Access gate for Railway previews, and the
 * single edge-cache choke point for built-in Payload REST collection reads.
 *
 * The gate comes first, because a preview reached on its raw Railway host has
 * skipped Access entirely — see `previewGate`. Everything it lets through goes
 * on to `@/plugins/cache/middleware`, which holds the cache decision and its
 * rationale.
 *
 * Deep-imports the plugin's Edge-safe `./middleware` (not the barrel): the
 * `@/plugins/cache` barrel exports the Payload plugin + purge, which pull
 * `serverEnv`/Payload — server-only code that must not enter the Edge bundle.
 * The imported module depends only on `next/server` + the pure policy, and
 * `@/lib/preview/proxy` is pure constants.
 */
import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'

import {
  isPreviewGateExempt,
  isRailwayPreviewHost,
  PREVIEW_DOMAIN_SUFFIX,
  PREVIEW_PROXY_SECRET_HEADER,
  previewNumberFromRailwayHost,
  previewOrigin,
} from '@/lib/preview/proxy'
import { handleCacheMiddleware } from '@/plugins/cache/middleware'

/**
 * Refuse, or redirect, a request that reached a preview without passing through
 * the Worker. Returns `null` for anything that should be served.
 *
 * ⚠ **The host cannot tell the Worker from a stranger.** The Worker's own
 * `fetch` to Railway carries the Railway host too, so proof of the hop is the
 * shared-secret header it sets and nothing else. The header is not an identity:
 * Cloudflare Access settled who the caller is before the Worker ran.
 *
 * ⚠ **Production and local dev are untouched**, because neither is a Railway
 * `pr-<n>` host. The gate's whole input is the request.
 */
function previewGate(request: NextRequest): NextResponse | null {
  const host = request.headers.get('host')
  if (!isRailwayPreviewHost(host)) return null
  if (isPreviewGateExempt(request.nextUrl.pathname)) return null
  if (request.headers.has(PREVIEW_PROXY_SECRET_HEADER)) return null

  const pr = previewNumberFromRailwayHost(host)
  if (!pr) {
    // Unreachable through `isRailwayPreviewHost`, which reads the same number.
    // Refusing beats guessing: without the number there is no address to name.
    return new NextResponse(`This preview is reachable only at ${PREVIEW_DOMAIN_SUFFIX}.\n`, {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const fixed = previewOrigin(pr)
  if (request.method === 'GET' || request.method === 'HEAD') {
    // A person who followed Railway's own address is sent on, path and query
    // intact, so the Access login they land on returns them where they meant to
    // go.
    return NextResponse.redirect(`${fixed}${request.nextUrl.pathname}${request.nextUrl.search}`)
  }

  return new NextResponse(`This preview is served at ${fixed}.\n`, {
    status: 403,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

export function middleware(request: NextRequest) {
  return previewGate(request) ?? handleCacheMiddleware(request)
}

export const config = {
  // Every path, because `/admin` on the raw Railway host would otherwise stay
  // open — the matcher used to be `/api/:path*`, for the cache alone. The three
  // exclusions are static assets the gate has no interest in and the cache
  // never stamped. ⚠ Matcher values must be build-time constants, so every
  // host test lives in the function body above.
  //
  // ⚠ Next buffers a copy of every MATCHED request body, capped by
  // `experimental.proxyClientMaxBodySize` in `next.config.mjs`, so this breadth
  // is pre-auth memory. Keep that cap strictly above `upload.requestSizeLimit`
  // (#938, #939).
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
}
