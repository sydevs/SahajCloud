import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  serverEnv: {
    CLOUDFLARE_ZONE_ID: undefined,
    CLOUDFLARE_CACHE_PURGE_TOKEN: undefined,
    WEMEDITATE_REVALIDATE_URL: undefined,
    WEMEDITATE_REVALIDATE_SECRET: undefined,
  },
}))

import { serverEnv } from '@/lib/env'
import { purgeCloudflareCache } from '@/plugins/cache/purge'
import {
  CONSUMER_CACHED_GLOBALS,
  revalidateConsumerCaches,
} from '@/plugins/cache/revalidateConsumers'

const env = serverEnv as {
  CLOUDFLARE_ZONE_ID?: string
  CLOUDFLARE_CACHE_PURGE_TOKEN?: string
  WEMEDITATE_REVALIDATE_URL?: string
  WEMEDITATE_REVALIDATE_SECRET?: string
}
const logger = { warn: vi.fn(), debug: vi.fn() }

function configure() {
  env.CLOUDFLARE_ZONE_ID = 'zone123'
  env.CLOUDFLARE_CACHE_PURGE_TOKEN = 'token-abc'
}

function configureRevalidate() {
  env.WEMEDITATE_REVALIDATE_URL = 'https://wemeditate.example/api/cache/invalidate'
  env.WEMEDITATE_REVALIDATE_SECRET = 'revalidate-secret-value-long'
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

describe('revalidateConsumerCaches (#710)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    env.WEMEDITATE_REVALIDATE_URL = undefined
    env.WEMEDITATE_REVALIDATE_SECRET = undefined
  })

  it('covers exactly the two globals WeMeditateWeb keeps in KV', () => {
    expect([...CONSUMER_CACHED_GLOBALS].sort()).toEqual(['wm-web-config', 'wm-web-translations'])
  })

  it('POSTs each cached slug to the consumer endpoint with the shared secret', async () => {
    configureRevalidate()
    for (const slug of CONSUMER_CACHED_GLOBALS) {
      const fetchFn = vi.fn().mockResolvedValue({ ok: true } as Response)
      expect(await revalidateConsumerCaches(slug, { fetchFn, logger })).toBe(true)

      const [url, init] = fetchFn.mock.calls[0] as [
        string,
        RequestInit & { headers: Record<string, string> },
      ]
      expect(url).toBe('https://wemeditate.example/api/cache/invalidate')
      expect(init.method).toBe('POST')
      expect(init.headers.Authorization).toBe('Bearer revalidate-secret-value-long')
      // The consumer owns its own key format and locale set, so we send the
      // slug and nothing else.
      expect(JSON.parse(init.body as string)).toEqual({ globals: [slug] })
    }
  })

  it('does not fire for a global no consumer caches beyond the edge', async () => {
    configureRevalidate()
    const fetchFn = vi.fn()
    for (const slug of [
      'sy-atlas-config',
      'sy-atlas-translations',
      'wm-app-config',
      'wm-app-translations',
      'wm-app-status',
      'meditations',
    ]) {
      expect(await revalidateConsumerCaches(slug, { fetchFn, logger })).toBe(false)
    }
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('is a no-op with the env vars unset — inert until the consumer ships its route', async () => {
    const fetchFn = vi.fn()
    expect(await revalidateConsumerCaches('wm-web-config', { fetchFn, logger })).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('is a no-op when only one of the two env vars is set', async () => {
    const fetchFn = vi.fn()
    env.WEMEDITATE_REVALIDATE_URL = 'https://wemeditate.example/api/cache/invalidate'
    expect(await revalidateConsumerCaches('wm-web-config', { fetchFn, logger })).toBe(false)

    env.WEMEDITATE_REVALIDATE_URL = undefined
    env.WEMEDITATE_REVALIDATE_SECRET = 'revalidate-secret-value-long'
    expect(await revalidateConsumerCaches('wm-web-config', { fetchFn, logger })).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('never throws: a rejected request returns false and warns', async () => {
    configureRevalidate()
    const fetchFn = vi.fn().mockRejectedValue(new Error('network'))
    expect(await revalidateConsumerCaches('wm-web-config', { fetchFn, logger })).toBe(false)
    expect(logger.warn).toHaveBeenCalled()
  })

  it('returns false on a non-OK response', async () => {
    configureRevalidate()
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response)
    expect(await revalidateConsumerCaches('wm-web-config', { fetchFn, logger })).toBe(false)
    expect(logger.warn).toHaveBeenCalled()
  })
})
