import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  serverEnv: { CLOUDFLARE_ZONE_ID: undefined, CLOUDFLARE_CACHE_PURGE_TOKEN: undefined },
}))

import { serverEnv } from '@/lib/env'
import { purgeCloudflareCache } from '@/plugins/cache/purge'

const env = serverEnv as { CLOUDFLARE_ZONE_ID?: string; CLOUDFLARE_CACHE_PURGE_TOKEN?: string }
const logger = { warn: vi.fn(), debug: vi.fn() }

function configure() {
  env.CLOUDFLARE_ZONE_ID = 'zone123'
  env.CLOUDFLARE_CACHE_PURGE_TOKEN = 'token-abc'
}

describe('purgeCloudflareCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    env.CLOUDFLARE_ZONE_ID = undefined
    env.CLOUDFLARE_CACHE_PURGE_TOKEN = undefined
  })

  it('is a no-op (returns false, no request) when zone/token are unset', async () => {
    const fetchFn = vi.fn()
    expect(await purgeCloudflareCache({ tags: ['meditations'] }, { fetchFn, logger })).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('POSTs a tag purge to the configured zone', async () => {
    configure()
    const fetchFn = vi.fn().mockResolvedValue({ ok: true } as Response)
    const ok = await purgeCloudflareCache(
      { tags: ['meditations', 'lectures'] },
      { fetchFn, logger },
    )
    expect(ok).toBe(true)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ]
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/zone123/purge_cache')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer token-abc')
    expect(JSON.parse(init.body as string)).toEqual({ tags: ['meditations', 'lectures'] })
  })

  it('falls back to files when no tags are given', async () => {
    configure()
    const fetchFn = vi.fn().mockResolvedValue({ ok: true } as Response)
    await purgeCloudflareCache({ files: ['https://cloud.example/x'] }, { fetchFn, logger })
    const init = fetchFn.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ files: ['https://cloud.example/x'] })
  })

  it('returns false without a request when neither tags nor files are given', async () => {
    configure()
    const fetchFn = vi.fn()
    expect(await purgeCloudflareCache({}, { fetchFn, logger })).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('is best-effort: returns false (never throws) when the request rejects', async () => {
    configure()
    const fetchFn = vi.fn().mockRejectedValue(new Error('network'))
    expect(await purgeCloudflareCache({ tags: ['meditations'] }, { fetchFn, logger })).toBe(false)
    expect(logger.warn).toHaveBeenCalled()
  })

  it('returns false on a non-OK response', async () => {
    configure()
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 403 } as Response)
    expect(await purgeCloudflareCache({ tags: ['meditations'] }, { fetchFn, logger })).toBe(false)
    expect(logger.warn).toHaveBeenCalled()
  })
})
