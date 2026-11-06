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
 * `serverEnv`/Payload. Keeping those out is required while this file is bundled
 * for the Edge runtime and harmless if it is not — `next@16` deprecated
 * `middleware` in favour of `proxy`, which defaults to Node, and this file keeps
 * the old name deliberately (its own ticket). `@/lib/preview/proxy` is pure
 * constants, so it is safe either way.
 */
import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'

import { railwayEnvironmentName } from '@/lib/env/deploymentEnvironment'
import {
  isPreviewEnvironmentName,
  PREVIEW_HEALTH_PATH,
  PREVIEW_PROXY_SECRET_HEADER,
  previewNumberFromEnvironmentName,
  previewOrigin,
} from '@/lib/preview/proxy'
import { handleCacheMiddleware } from '@/plugins/cache/middleware'

const refuse = (body: string): NextResponse =>
  new NextResponse(`${body}\n`, {
    status: 403,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })

/**
 * Refuse, or redirect, a request that reached a preview without passing through
 * the Worker. Returns `null` for anything that should be served.
 *
 * ⚠ **Whether this deployment is a preview is read from Railway's own
 * environment name, never from the request.** `Host` is a header the caller
 * writes, and a host test fails **open** on every shape it does not recognise —
 * an absent header, a `:port` suffix, a `railway.app` domain without `up.`. A
 * gate that serves what it cannot identify is not a gate. The environment name
 * is also what `previewAdmin` reads, so the gate and the sign-in bypass cover
 * one set by construction.
 *
 * ⚠ **The header's VALUE is compared.** Its name is in a public repository, and
 * a preview's Railway host is published in an anonymously readable commit
 * status — so a gate that asked only whether the header was present would be
 * opened by anyone who read either. The Worker overwrites a caller's own copy
 * with `Headers.set` before its subrequest, so the value never comes from
 * outside.
 *
 * ⚠ **Fail closed on a missing secret.** With `PREVIEW_PROXY_SECRET` unset, a
 * preview refuses everything but its health route — loud, and reported by the
 * smoke lane — rather than serving the whole admin panel to anyone.
 *
 * ⚠ **Production and local dev are untouched**, because neither is a `pr-<n>`
 * Railway environment. Nothing here runs a second string test to establish that.
 */
function previewGate(request: NextRequest): NextResponse | null {
  // ⚠ **Through `railwayEnvironmentName`, never `process.env` here.** It prefers
  // `RAILWAY_ENVIRONMENT_NAME` and falls back to the legacy `RAILWAY_ENVIRONMENT`,
  // which Railway also sets — and reading only the first fails **open** on an
  // environment that carries only the second, while `previewAdmin`, which does
  // read both, would still be listing every account. It is zod-free and reads
  // both as literal member expressions, so it survives an Edge bundle.
  const environmentName = railwayEnvironmentName()
  if (!isPreviewEnvironmentName(environmentName)) return null

  const { method, nextUrl } = request
  const reading = method === 'GET' || method === 'HEAD'
  if (reading && nextUrl.pathname === PREVIEW_HEALTH_PATH) return null

  const expected = process.env.PREVIEW_PROXY_SECRET
  if (expected && request.headers.get(PREVIEW_PROXY_SECRET_HEADER) === expected) return null

  const pr = previewNumberFromEnvironmentName(environmentName)
  // Unreachable: `isPreviewEnvironmentName` above is the same predicate this
  // reads. Refusing rather than asserting keeps the failure a refusal.
  if (!pr) return refuse('This preview is not reachable at this address.')

  const fixed = previewOrigin(pr)
  if (!expected) {
    return refuse(
      `This preview is misconfigured: it holds no proxy secret, so it cannot tell the ` +
        `gate in front of ${fixed} from anyone else, and refuses both.`,
    )
  }

  if (reading) {
    // A person who followed Railway's own address is sent on, path and query
    // intact, so the Access login they land on returns them where they meant to
    // go.
    return NextResponse.redirect(`${fixed}${nextUrl.pathname}${nextUrl.search}`)
  }

  return refuse(`This preview is served at ${fixed}.`)
}

export function middleware(request: NextRequest) {
  return previewGate(request) ?? handleCacheMiddleware(request)
}

export const config = {
  // Every path, because `/admin` on the raw Railway host would otherwise stay
  // open — the matcher used to be `/api/:path*`, for the cache alone. The three
  // exclusions are static assets the gate has no interest in and the cache
  // never stamped. ⚠ Matcher values must be build-time constants, so every
  // test the gate makes lives in the function body above.
  //
  // ⚠ Next buffers a copy of every MATCHED request body, capped by
  // `experimental.proxyClientMaxBodySize` in `next.config.mjs`, so this breadth
  // is pre-auth memory. Keep that cap strictly above `upload.requestSizeLimit`
  // (#938, #939). The old matcher already covered every nonexistent `/api/…`,
  // so the widening adds routes rather than an amplification this did not have.
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
}
