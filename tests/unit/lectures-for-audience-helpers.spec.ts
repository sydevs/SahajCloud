import { describe, expect, it } from 'vitest'

import { mergeSubtitles, resolveThumbnailUrl } from '@/lib/lectureShape'

describe('mergeSubtitles', () => {
  it('returns the base map unchanged when there are no overrides', () => {
    const base = { en: 'base-en', es: 'base-es' }
    expect(mergeSubtitles(base, undefined)).toEqual(base)
    expect(mergeSubtitles(base, null)).toEqual(base)
    expect(mergeSubtitles(base, [])).toEqual(base)
  })

  it('layers each non-empty override on top of the base map', () => {
    const base = { en: 'base-en', es: 'base-es', de: 'base-de' }
    const overrides = [
      { locale: 'es', url: 'override-es' },
      { locale: 'fr', url: 'override-fr' },
    ]
    expect(mergeSubtitles(base, overrides)).toEqual({
      en: 'base-en',
      es: 'override-es', // overridden
      de: 'base-de',
      fr: 'override-fr', // added
    })
  })

  it('ignores override rows with empty or missing url', () => {
    const base = { en: 'base-en' }
    const overrides = [
      { locale: 'en', url: '' },
      { locale: 'es', url: 'override-es' },
    ] as Array<{ locale: string; url: string }>
    expect(mergeSubtitles(base, overrides)).toEqual({
      en: 'base-en', // empty url did NOT override
      es: 'override-es',
    })
  })

  it('returns an empty object when neither side has data', () => {
    expect(mergeSubtitles(null, null)).toEqual({})
    expect(mergeSubtitles(undefined, undefined)).toEqual({})
  })

  it('does not mutate the input base map', () => {
    const base = { en: 'base-en' }
    mergeSubtitles(base, [{ locale: 'es', url: 'override-es' }])
    expect(base).toEqual({ en: 'base-en' })
  })
})

describe('resolveThumbnailUrl', () => {
  const img = (url: string) => ({ id: 1, url } as { id: number; url: string })

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
    // At depth:1 the /api/lectures/for-audience endpoint always receives
    // populated Image objects; if it ever sees a raw number it cannot resolve
    // a URL, so it must fall through to the fallback.
    expect(
      resolveThumbnailUrl({
        override: 42,
        fallback: 'fallback-url',
      }),
    ).toBe('fallback-url')
  })
})
