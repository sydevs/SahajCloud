import type { PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import { loadAppConfigOnce } from '@/collections/Pages/appConfigCache'

/**
 * Minimal PayloadRequest stub — loadAppConfigOnce only touches `context` and
 * `payload.findGlobal`. Returns the spy separately so assertions stay cleanly
 * typed instead of reaching through the cast request.
 */
function makeReq(impl: () => Promise<Record<string, unknown>>) {
  const findGlobal = vi.fn(impl)
  const req = { context: {}, payload: { findGlobal } } as unknown as PayloadRequest
  return { req, findGlobal }
}

describe('loadAppConfigOnce (#542 bulk-publish stampede guard)', () => {
  it('issues a single findGlobal when many callers race before it resolves', async () => {
    // A deferred load: every caller arrives while it is still pending — the
    // exact bulk-publish concurrency (Payload runs each doc's afterRead via
    // Promise.all) that stampedes a resolved-value cache. Controlling when it
    // resolves makes the race deterministic instead of timing-dependent.
    let resolve!: (v: Record<string, unknown>) => void
    const pending = new Promise<Record<string, unknown>>((r) => {
      resolve = r
    })
    const { req, findGlobal } = makeReq(() => pending)

    const inflight = Array.from({ length: 8 }, () => loadAppConfigOnce(req))
    resolve({ morningMeditation: 1 })
    const results = await Promise.all(inflight)

    // A value cache would call findGlobal 8× here — all 8 clear the "not cached"
    // check before the first settles. The promise cache collapses it to one.
    expect(findGlobal).toHaveBeenCalledTimes(1)
    expect(findGlobal).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'wm-app-config', depth: 0 }),
    )
    results.forEach((r) => expect(r).toEqual({ morningMeditation: 1 }))
  })

  it('reuses the cached load for later callers in the same request', async () => {
    const { req, findGlobal } = makeReq(async () => ({ foo: 'bar' }))

    const first = await loadAppConfigOnce(req)
    const second = await loadAppConfigOnce(req)

    expect(second).toBe(first)
    expect(findGlobal).toHaveBeenCalledTimes(1)
  })

  it('evicts the cache on failure so a later read in the request retries', async () => {
    let calls = 0
    const { req, findGlobal } = makeReq(() => {
      calls += 1
      return calls === 1 ? Promise.reject(new Error('boom')) : Promise.resolve({ ok: true })
    })

    await expect(loadAppConfigOnce(req)).rejects.toThrow('boom')
    // A cached rejection would poison the rest of the request; eviction lets the
    // next read reload instead.
    await expect(loadAppConfigOnce(req)).resolves.toEqual({ ok: true })
    expect(findGlobal).toHaveBeenCalledTimes(2)
  })

  it('does not share the cache across requests', async () => {
    const a = makeReq(async () => ({ n: 'a' }))
    const b = makeReq(async () => ({ n: 'b' }))

    expect(await loadAppConfigOnce(a.req)).toEqual({ n: 'a' })
    expect(await loadAppConfigOnce(b.req)).toEqual({ n: 'b' })
    expect(a.findGlobal).toHaveBeenCalledTimes(1)
    expect(b.findGlobal).toHaveBeenCalledTimes(1)
  })
})
