import type { PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import { PREVIEW_SECRET_HEADER } from '@/lib/utilities/previewSecret'
import { publicReadCacheHeaders } from '@/plugins/cache/cacheHeaders'

/**
 * A request as a custom endpoint sees one. Only the headers matter here: the
 * decorator reads the live-preview header's PRESENCE rather than asking the
 * access layer whether it is valid.
 *
 * ⚠ **That asymmetry is the point, and it used to be a bug.** The validated
 * verdict is stamped on `req.context` by `resolveLivePreviewHook`. Every
 * endpoint that calls this reads through `asTrustedReq`, which clones the
 * context so its `SKIP_VALIDATION` flag cannot leak back — so the stamp lands
 * on the clone and the request handed here never carries it. Asking for
 * validity returned `false` for every preview read on those routes, and
 * stamped a draft-bearing response `public, s-maxage=…` with
 * `Vary: Authorization`, where it could be replayed to anyone sharing the key.
 */
const reqWith = (headers: Record<string, string> = {}): PayloadRequest =>
  ({ headers: new Headers(headers) }) as unknown as PayloadRequest

describe('publicReadCacheHeaders', () => {
  it('returns private, no-store when the live-preview header is present', () => {
    expect(publicReadCacheHeaders(reqWith({ [PREVIEW_SECRET_HEADER]: 'a.token' }), ['meditations'])).toEqual(
      { 'Cache-Control': 'private, no-store' },
    )
  })

  it('refuses to cache even a header it cannot validate', () => {
    // Presence cannot miss the way a context lookup did. The cost is a
    // slightly colder cache for a bogus header; the alternative was caching a
    // draft. The access layer still decides what is actually returned.
    expect(publicReadCacheHeaders(reqWith({ [PREVIEW_SECRET_HEADER]: 'nonsense' }), ['songs'])).toEqual(
      { 'Cache-Control': 'private, no-store' },
    )
  })

  it('caches normally when no live-preview header rides along', () => {
    // app-cards=600, audiences=300 → 300 (never outlive the freshest input)
    const headers = publicReadCacheHeaders(reqWith(), ['app-cards', 'audiences'])
    expect(headers['Cache-Control']).toBe('public, max-age=300, s-maxage=300')
    expect(headers['Cache-Tag']).toBe('app-cards,audiences')
    expect(headers['Vary']).toBe('Authorization')
  })

  it('uses the default TTL when every collection is at the default', () => {
    const headers = publicReadCacheHeaders(reqWith(), ['songs', 'meditations'])
    expect(headers['Cache-Control']).toBe('public, max-age=600, s-maxage=600')
    expect(headers['Cache-Tag']).toBe('songs,meditations')
  })
})
