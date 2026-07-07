import type { PayloadRequest } from 'payload'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/utilities/previewSecret', () => ({ hasValidPreviewSecret: vi.fn() }))

import { publicReadCacheHeaders } from '@/lib/endpoints/cacheHeaders'
import { hasValidPreviewSecret } from '@/lib/utilities/previewSecret'

// The helper only forwards `req` to hasValidPreviewSecret (mocked here), so a
// bare stub is enough.
const req = {} as PayloadRequest

describe('publicReadCacheHeaders', () => {
  beforeEach(() => {
    vi.mocked(hasValidPreviewSecret).mockReset()
  })

  it('returns private, no-store for a valid preview request (never cache drafts)', () => {
    vi.mocked(hasValidPreviewSecret).mockReturnValue(true)
    expect(publicReadCacheHeaders(req, { sMaxAge: 600, tags: ['meditations'] })).toEqual({
      'Cache-Control': 'private, no-store',
    })
  })

  it('returns public cache headers + Cache-Tag for a normal read', () => {
    vi.mocked(hasValidPreviewSecret).mockReturnValue(false)
    const headers = publicReadCacheHeaders(req, {
      sMaxAge: 600,
      staleWhileRevalidate: 300,
      tags: ['meditations', 'lectures'],
    })
    expect(headers['Cache-Control']).toBe(
      'public, max-age=600, s-maxage=600, stale-while-revalidate=300',
    )
    expect(headers['Cache-Tag']).toBe('meditations,lectures')
  })

  it('omits stale-while-revalidate and Cache-Tag when not provided', () => {
    vi.mocked(hasValidPreviewSecret).mockReturnValue(false)
    const headers = publicReadCacheHeaders(req, { sMaxAge: 300 })
    expect(headers['Cache-Control']).toBe('public, max-age=300, s-maxage=300')
    expect(headers['Cache-Tag']).toBeUndefined()
  })
})
