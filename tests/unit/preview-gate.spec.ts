import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PREVIEW_PROXY_SECRET_HEADER } from '@/lib/preview/proxy'

/**
 * The gate in front of a Railway preview (`src/middleware.ts`).
 *
 * ⚠ **It is the whole of what makes a preview private on the Railway host.**
 * Cloudflare Access protects the fixed `pr-<n>` address; the Railway host is a
 * second address for the same deployment, and Access never sees a request that
 * arrives there. That host is also published, anonymously readable, in Railway's
 * commit status on every PR of this public repository — so every case below is
 * reached by a stranger who read one web page.
 *
 * Three properties, each of which failed in a way nothing else would catch:
 *
 * - **The secret's VALUE is compared.** The header's name is in this repository,
 *   so a gate that asked whether the header was *present* was opened by anyone
 *   who read the source — and the same request then gets an admin session, since
 *   the preview signs any manager in and the admin's address is a committed
 *   constant.
 * - **Whether this is a preview comes from Railway's environment name**, never
 *   the request's own `Host`. A host test fails *open* on every shape it does
 *   not recognise, and what it does not recognise is a caller's choice.
 * - **A missing secret refuses.** The alternative is serving the admin panel to
 *   anyone while the deployment looks healthy.
 */
const SECRET = 'a-real-shared-secret'
const FIXED = 'https://pr-470.cloud-preview.sydevelopers.com'

const originalEnv = process.env

let middleware: typeof import('@/middleware').middleware

/** Re-imported per case: the gate reads `process.env` the way Next inlines it. */
async function load(env: Record<string, string | undefined>) {
  vi.resetModules()
  process.env = { ...originalEnv, ...env }
  middleware = (await import('@/middleware')).middleware
}

const onPreview = (over: Record<string, string | undefined> = {}) =>
  load({ PREVIEW_PROXY_SECRET: SECRET, RAILWAY_ENVIRONMENT_NAME: 'SahajCloud-pr-470', ...over })

const request = (
  path: string,
  { method = 'GET', secret }: { method?: string; secret?: string } = {},
): NextRequest =>
  new NextRequest(`https://sahajcloud-sahajcloud-pr-470.up.railway.app${path}`, {
    headers: secret === undefined ? {} : { [PREVIEW_PROXY_SECRET_HEADER]: secret },
    method,
  })

/** `NextResponse.next()` — the pass-through the cache middleware also returns. */
const servedBy = (response: ReturnType<typeof middleware>) =>
  response.headers.get('x-middleware-next') === '1' ? 'served' : response.status

describe('the preview gate', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('serves a request carrying the right secret', async () => {
    await onPreview()

    expect(servedBy(middleware(request('/admin', { secret: SECRET })))).toBe('served')
  })

  it('refuses a request that only carries the header, with any other value', async () => {
    // ⚠ The bypass this exists for. The header's name is public, so `has()`
    // admitted `curl -H 'x-sahajcloud-preview-proxy: anything'` — and the very
    // next request got an admin session token.
    await onPreview()

    // No trailing-whitespace case: the Headers API trims a header value before
    // the gate ever reads it, so one would assert the platform, not the gate.
    for (const secret of ['', 'anything', SECRET.slice(0, -1), SECRET.toUpperCase()]) {
      expect(servedBy(middleware(request('/admin', { secret }))), secret).not.toBe('served')
    }
  })

  it('refuses a write with no secret at all', async () => {
    await onPreview()

    expect(middleware(request('/api/managers/request-magic-link', { method: 'POST' })).status).toBe(
      403,
    )
  })

  it('sends a browser GET on to the fixed address, path and query intact', async () => {
    await onPreview()

    const response = middleware(request('/admin/collections/events?limit=5'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(`${FIXED}/admin/collections/events?limit=5`)
  })

  it('serves the health route with no secret, for a read only', async () => {
    // ⚠ Its consumer is CI's discovery poll, which reaches the Railway host
    // before the fixed address can answer for this push. The exemption is the
    // gate's only hole, so it is exact and read-only: `/api/health/<anything>`
    // falls through to Payload's catch-all, and a write there is nobody's.
    await onPreview()

    expect(servedBy(middleware(request('/api/health')))).toBe('served')
    expect(servedBy(middleware(request('/api/health', { method: 'HEAD' })))).toBe('served')
    expect(servedBy(middleware(request('/api/health/users')))).not.toBe('served')
    expect(servedBy(middleware(request('/api/health', { method: 'POST' })))).not.toBe('served')
  })

  it('refuses everything but the health route when the secret is unset', async () => {
    // Loud, and reported by the smoke lane. The alternative is a deployment
    // that looks healthy and serves its admin panel to anyone.
    await onPreview({ PREVIEW_PROXY_SECRET: undefined })

    expect(middleware(request('/admin', { secret: SECRET })).status).toBe(403)
    expect(servedBy(middleware(request('/api/health')))).toBe('served')
  })

  it('leaves production alone, which also has a railway.app host', async () => {
    // Production must keep a `*.up.railway.app` domain or every future PR
    // environment silently gets none (#661).
    await load({ PREVIEW_PROXY_SECRET: SECRET, RAILWAY_ENVIRONMENT_NAME: 'production' })

    expect(servedBy(middleware(request('/admin')))).toBe('served')
  })

  it('leaves every other named Railway environment alone', async () => {
    // ⚠ The gate covers `pr-<n>` and nothing else, so it must not refuse an
    // environment no Worker answers for — a `staging` deployment reached on its
    // own public URL would otherwise serve nothing at all. The same allowlist
    // is what stops `previewAdmin` publishing its account list there.
    for (const name of ['staging', 'production-eu', 'pr-', 'hotfix']) {
      await load({ PREVIEW_PROXY_SECRET: SECRET, RAILWAY_ENVIRONMENT_NAME: name })

      expect(servedBy(middleware(request('/admin'))), name).toBe('served')
    }
  })

  it('leaves local development alone, which names no environment', async () => {
    await load({ PREVIEW_PROXY_SECRET: undefined, RAILWAY_ENVIRONMENT_NAME: undefined })

    expect(servedBy(middleware(request('/admin')))).toBe('served')
  })
})
