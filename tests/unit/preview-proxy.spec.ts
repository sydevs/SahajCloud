import { describe, expect, it, vi } from 'vitest'

import { PREVIEW_PROXY_SECRET_HEADER } from '@/lib/preview/proxy'

import { handle, previewNumberFromProxyHost, type Env } from '../../preview-proxy/index'

/**
 * The Worker in front of each Railway preview (`preview-proxy/index.ts`).
 *
 * Cloudflare Access runs ahead of it, so nothing here authenticates anyone.
 * What it owns is the three things nothing else can check: it never builds a
 * Railway host, it marks both hops uncacheable, and it does not buffer the
 * upstream body.
 */
const RAILWAY_HOST = 'sahajcloud-sahajcloud-pr-470.up.railway.app'

const env = (hosts: Record<string, string> = { 'pr-470': RAILWAY_HOST }): Env => ({
  PREVIEW_HOSTS: { get: (key) => Promise.resolve(hosts[key] ?? null) },
  PREVIEW_PROXY_SECRET: 'shared-secret',
})

const ok = () => new Response('body', { status: 200, headers: { 'Cache-Control': 'max-age=60' } })

describe('previewNumberFromProxyHost', () => {
  it('reads the PR off a fixed address and nothing else', () => {
    expect(previewNumberFromProxyHost('pr-470.cloud-preview.sydevelopers.com')).toBe('470')
    expect(previewNumberFromProxyHost('cloud.sydevelopers.com')).toBeNull()
    expect(previewNumberFromProxyHost('pr-470.example.com')).toBeNull()
    expect(previewNumberFromProxyHost('staging.cloud-preview.sydevelopers.com')).toBeNull()
  })
})

describe('the preview proxy', () => {
  it('sends the request to the discovered Railway host, with the shared secret', async () => {
    const fetcher = vi.fn(ok)

    await handle(
      new Request('https://pr-470.cloud-preview.sydevelopers.com/admin?x=1'),
      env(),
      fetcher as unknown as typeof fetch,
    )

    const [target, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit]
    expect(target.toString()).toBe(`https://${RAILWAY_HOST}/admin?x=1`)
    expect(new Headers(init.headers).get(PREVIEW_PROXY_SECRET_HEADER)).toBe('shared-secret')
    // The app's own 302s are the visitor's to follow at the fixed address.
    expect(init.redirect).toBe('manual')
  })

  it('marks both hops uncacheable, which takes two different mechanisms', async () => {
    // ⚠ Workers run ahead of the cache, so the zone's cache-phase rule is
    // evaluated on the subrequest below rather than on the inbound request.
    // Neither half alone covers both hops.
    const fetcher = vi.fn(ok)

    const response = await handle(
      new Request('https://pr-470.cloud-preview.sydevelopers.com/api/health'),
      env(),
      fetcher as unknown as typeof fetch,
    )

    const [, init] = fetcher.mock.calls[0] as unknown as [URL, { cf?: { cacheTtl?: number } }]
    expect(init.cf).toEqual({ cacheTtl: -1 })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('streams the upstream body rather than reading it to completion', async () => {
    // ⚠ `POST /api/seed/<script>` reports its progress as SSE with a heartbeat
    // every 5 s. A Worker that awaited the whole body would hold the fill and
    // report nothing until it ended.
    let push: (chunk: string) => void = () => {}
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        push = (chunk) => controller.enqueue(new TextEncoder().encode(chunk))
      },
    })

    const response = await handle(
      new Request('https://pr-470.cloud-preview.sydevelopers.com/api/seed/preview-fixture', {
        method: 'POST',
      }),
      env(),
      (() => new Response(stream, { status: 200 })) as unknown as typeof fetch,
    )

    push('data: regions 1/3\n\n')
    const first = await response.body!.getReader().read()

    expect(new TextDecoder().decode(first.value)).toContain('regions 1/3')
  })

  it('answers 503 for a PR with no mapping yet, and 404 for a hostname of nobody', async () => {
    const pending = await handle(
      new Request('https://pr-999.cloud-preview.sydevelopers.com/'),
      env(),
      vi.fn(ok) as unknown as typeof fetch,
    )
    const stranger = await handle(
      new Request('https://cloud.sydevelopers.com/'),
      env(),
      vi.fn(ok) as unknown as typeof fetch,
    )

    expect(pending.status).toBe(503)
    expect(stranger.status).toBe(404)
    expect(stranger.headers.get('cache-control')).toBe('private, no-store')
  })
})
