import { describe, expect, it } from 'vitest'

import { resolveThumbnailUrl } from '@/lib/utilities/thumbnailUrl'

describe('resolveThumbnailUrl', () => {
  const img = (url: string) => ({ id: 1, url }) as { id: number; url: string }

  it('picks the override first', () => {
    expect(
      resolveThumbnailUrl({
        override: img('override-url'),
        fallback: 'fallback-url',
      }),
    ).toBe('override-url')
  })

  it('falls back to the fallback URL when the override is empty', () => {
    expect(
      resolveThumbnailUrl({
        override: null,
        fallback: 'fallback-url',
      }),
    ).toBe('fallback-url')
    expect(
      resolveThumbnailUrl({
        override: undefined,
        fallback: 'fallback-url',
      }),
    ).toBe('fallback-url')
  })

  it('returns null when nothing is supplied', () => {
    expect(resolveThumbnailUrl({})).toBeNull()
    expect(
      resolveThumbnailUrl({
        override: null,
        fallback: null,
      }),
    ).toBeNull()
  })

  it('ignores number-only refs (depth:0 IDs have no url to extract)', () => {
    // At depth:1 the consuming endpoints always receive populated Image objects;
    // if one ever sees a raw number it cannot resolve a URL, so it must fall
    // through to the fallback.
    expect(
      resolveThumbnailUrl({
        override: 42,
        fallback: 'fallback-url',
      }),
    ).toBe('fallback-url')
  })
})
