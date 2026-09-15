/**
 * Edge-cache middleware for the **built-in** Payload REST collection reads.
 *
 * The generated `REST_GET` route (`src/app/(payload)/api/[...slug]/route.ts`)
 * must stay thin and emits no cache headers, so a Next.js middleware is the
 * single choke point that makes `GET /api/<collection>` reads edge-cacheable
 * without touching the generated file. The 7 custom endpoints are **not**
 * handled here — they self-manage headers in-handler via
 * {@link publicReadCacheHeaders} and are deliberately excluded by
 * {@link matchCacheableRead} (see its doc block), so there is no double-stamping.
 *
 * Edge-safe by construction: imports only `next/server` + the pure `./policy`.
 * Do **not** import the barrel or any server-only sibling here — that would pull
 * `serverEnv` / Payload into the Edge bundle.
 */
import type { NextRequest } from 'next/server'

import { NextResponse } from 'next/server'

import { buildCacheHeaders, isDraftRead, matchCacheableRead, PREVIEW_SECRET_HEADER } from './policy'

/**
 * Decides and applies edge-cache headers for a built-in REST read. Returns a
 * pass-through `NextResponse.next()` unchanged for everything that isn't a
 * cacheable client read:
 *
 * - **writes** (`POST`/`PATCH`/`DELETE`/…) — untouched.
 * - **non-cacheable / custom paths** — untouched (`matchCacheableRead` → null).
 * - **manager/admin reads** — cookie-authenticated (no `Authorization` header),
 *   so they stay `DYNAMIC`; only API-key client reads are stamped `public`.
 * - **preview reads** — carry the preview-secret header → `private, no-store`
 *   (defense-in-depth; drafts are never cached).
 * - **draft reads** — carry a truthy `?draft=` → `private, no-store`, whether or
 *   not a preview secret rides with them. The two are independent: a caller may
 *   legitimately be authorised for drafts without holding the preview secret,
 *   and the response still must not be stored where `Vary: Authorization` would
 *   replay it to every request sharing that API key.
 */
export function handleCacheMiddleware(request: NextRequest): NextResponse {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return NextResponse.next()
  }

  const policy = matchCacheableRead(request.nextUrl.pathname)
  if (!policy) return NextResponse.next()

  const preview = request.headers.has(PREVIEW_SECRET_HEADER)
  const draft = isDraftRead(request.nextUrl.searchParams)
  // Only client (API-key) reads carry `Authorization`; without it the request is
  // a manager cookie read or anonymous — leave it DYNAMIC.
  const authed = request.headers.has('authorization')
  if (!preview && !authed) return NextResponse.next()

  const response = NextResponse.next()
  for (const [key, value] of Object.entries(buildCacheHeaders({ ...policy, preview, draft }))) {
    response.headers.set(key, value)
  }
  return response
}
