import type { PayloadRequest } from 'payload'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/utilities/previewSecret', () => ({ hasValidPreviewSecret: vi.fn() }))

import { hasValidPreviewSecret } from '@/lib/utilities/previewSecret'
import { publicReadCacheHeaders } from '@/plugins/cache/cacheHeaders'

// The decorator only forwards `req` to hasValidPreviewSecret (mocked here), so a
// bare stub is enough.
const req = {} as PayloadRequest

describe('publicReadCacheHeaders', () => {
  beforeEach(() => {
    vi.mocked(hasValidPreviewSecret).mockReset()
  })

  it('returns private, no-store for a valid preview request (never cache drafts)', () => {
    vi.mocked(hasValidPreviewSecret).mockReturnValue(true)
    expect(publicReadCacheHeaders(req, ['meditations'])).toEqual({
      'Cache-Control': 'private, no-store',
    })
  })

  it('derives the TTL as the lowest of the collections, with Vary + Cache-Tag', () => {
    vi.mocked(hasValidPreviewSecret).mockReturnValue(false)
    // app-cards=600, audiences=300 → 300 (never outlive the freshest input)
    const headers = publicReadCacheHeaders(req, ['app-cards', 'audiences'])
    expect(headers['Cache-Control']).toBe('public, max-age=300, s-maxage=300')
    expect(headers['Cache-Tag']).toBe('app-cards,audiences')
    expect(headers['Vary']).toBe('Authorization')
  })

  it('uses the default TTL when every collection is at the default', () => {
    vi.mocked(hasValidPreviewSecret).mockReturnValue(false)
    const headers = publicReadCacheHeaders(req, ['songs', 'meditations'])
    expect(headers['Cache-Control']).toBe('public, max-age=600, s-maxage=600')
    expect(headers['Cache-Tag']).toBe('songs,meditations')
  })
})
