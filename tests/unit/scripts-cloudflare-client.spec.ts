import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CloudflareError, cfFetch } from '../../scripts/lib/cloudflare'

/**
 * The Cloudflare client the operator scripts share (`scripts/lib/cloudflare.ts`).
 *
 * Both cases below were live in two of the three scripts that hand-rolled this,
 * and neither is reachable from a status check alone — which is why they are
 * pinned here rather than left to the one script that happened to get them
 * right.
 */
const respond = (body: string, init: ResponseInit): void => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, init)))
}

beforeEach(() => {
  process.env.CLOUDFLARE_API_KEY = 'token'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cfFetch', () => {
  it('refuses a 200 that carries success: false', async () => {
    respond(JSON.stringify({ success: false, errors: [{ code: 10000, message: 'Auth error' }] }), {
      status: 200,
    })

    await expect(cfFetch('PUT', '/accounts/a/workers/domains')).rejects.toThrow(
      /HTTP 200 — 10000: Auth error/,
    )
  })

  it('keeps the status when the body is not JSON at all', async () => {
    respond('<html>error 1016</html>', { status: 502 })

    const error = await cfFetch('GET', '/accounts/a/stream').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CloudflareError)
    expect((error as CloudflareError).status).toBe(502)
  })

  it('accepts the empty body a KV write answers with', async () => {
    respond('', { status: 200 })

    await expect(cfFetch('PUT', '/accounts/a/storage/kv')).resolves.toEqual({})
  })

  it('refuses an unparseable body on a 200, which no caller may read as empty', async () => {
    respond('<html>just a moment…</html>', { status: 200 })

    await expect(cfFetch('GET', '/accounts/a/stream/webhook')).rejects.toThrow(/not JSON/)
  })

  it('sends a Content-Type only with a body', async () => {
    respond('{}', { status: 200 })
    await cfFetch('GET', '/accounts/a/stream')
    const [, withoutBody] = vi.mocked(fetch).mock.calls[0]
    expect((withoutBody?.headers as Record<string, string>)['Content-Type']).toBeUndefined()

    respond('{}', { status: 200 })
    await cfFetch('PUT', '/accounts/a/storage/kv', { body: 'host', contentType: 'text/plain' })
    const [, withBody] = vi.mocked(fetch).mock.calls[0]
    expect((withBody?.headers as Record<string, string>)['Content-Type']).toBe('text/plain')
  })
})
