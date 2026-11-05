import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { PREVIEW_PROXY_SECRET_HEADER } from '@/lib/preview/proxy'
import { middleware } from '@/middleware'

/**
 * The gate in front of a Railway preview (`src/middleware.ts`).
 *
 * ⚠ **It is the whole of what makes a preview private on the Railway host.**
 * Cloudflare Access protects the fixed `pr-<n>` address; the Railway host is a
 * second address for the same deployment, and Access never sees a request that
 * arrives there. So every case below is reached by a stranger who knows the
 * Railway host — which is published in a GitHub commit status on every PR.
 *
 * The exemption case is the one that cannot be found any other way: a host-only
 * gate makes every preview undeployable, and because the gate ships in the PR
 * that gates its own preview, the only symptom is three failed deploys.
 */
const PREVIEW_HOST = 'sahajcloud-sahajcloud-pr-470.up.railway.app'
const PRODUCTION_HOST = 'sahajcloud-production.up.railway.app'

const request = (
  path: string,
  { host = PREVIEW_HOST, method = 'GET', proxied = false } = {},
): NextRequest =>
  new NextRequest(`https://${host}${path}`, {
    headers: { host, ...(proxied ? { [PREVIEW_PROXY_SECRET_HEADER]: 'shared-secret' } : {}) },
    method,
  })

/** `NextResponse.next()` — the pass-through the cache middleware also returns. */
const servedBy = (response: ReturnType<typeof middleware>) =>
  response.headers.get('x-middleware-next') === '1' ? 'served' : response.status

describe('the preview gate', () => {
  it('serves a request carrying the proxy header', () => {
    expect(servedBy(middleware(request('/admin', { proxied: true })))).toBe('served')
  })

  it('refuses a write that does not carry it', () => {
    const response = middleware(request('/api/managers/request-magic-link', { method: 'POST' }))

    expect(response.status).toBe(403)
  })

  it('sends a browser GET on to the fixed address, path and query intact', () => {
    const response = middleware(request('/admin/collections/events?limit=5'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://pr-470.cloud-preview.sydevelopers.com/admin/collections/events?limit=5',
    )
  })

  it('serves the health route with no header at all', () => {
    // ⚠ Railway's healthcheck arrives inside Railway as
    // `Host: healthcheck.railway.app` and never traverses Cloudflare, so it can
    // carry neither an Access session nor the proxy header. Refusing it fails
    // the deploy rather than reporting anything.
    expect(servedBy(middleware(request('/api/health')))).toBe('served')
  })

  it('leaves production alone, which also has a railway.app host', () => {
    // Production must keep a `*.up.railway.app` domain or every future PR
    // environment silently gets none (#661), so the suffix cannot decide this.
    expect(servedBy(middleware(request('/admin', { host: PRODUCTION_HOST })))).toBe('served')
  })

  it('leaves local development alone', () => {
    expect(servedBy(middleware(request('/admin', { host: 'localhost:3000' })))).toBe('served')
  })
})
