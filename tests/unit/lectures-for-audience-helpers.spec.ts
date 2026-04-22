import { describe, expect, it } from 'vitest'

import { mergeSubtitles, resolveThumbnailUrl } from '@/endpoints/lecturesForAudience'

describe('mergeSubtitles', () => {
  it('returns the parent map unchanged when there are no clip overrides', () => {
    const parent = { en: 'parent-en', es: 'parent-es' }
    expect(mergeSubtitles(parent, undefined)).toEqual(parent)
    expect(mergeSubtitles(parent, null)).toEqual(parent)
    expect(mergeSubtitles(parent, [])).toEqual(parent)
  })

  it('layers each non-empty clip override on top of the parent map', () => {
    const parent = { en: 'parent-en', es: 'parent-es', de: 'parent-de' }
    const clip = [
      { locale: 'es', url: 'clip-es' },
      { locale: 'fr', url: 'clip-fr' },
    ]
    expect(mergeSubtitles(parent, clip)).toEqual({
      en: 'parent-en',
      es: 'clip-es', // overridden
      de: 'parent-de',
      fr: 'clip-fr', // added
    })
  })

  it('ignores clip rows with empty or missing url', () => {
    const parent = { en: 'parent-en' }
    const clip = [
      { locale: 'en', url: '' },
      { locale: 'es', url: 'clip-es' },
    ] as Array<{ locale: string; url: string }>
    expect(mergeSubtitles(parent, clip)).toEqual({
      en: 'parent-en', // empty url did NOT override
      es: 'clip-es',
    })
  })

  it('returns an empty object when neither side has data', () => {
    expect(mergeSubtitles(null, null)).toEqual({})
    expect(mergeSubtitles(undefined, undefined)).toEqual({})
  })

  it('does not mutate the input parent map', () => {
    const parent = { en: 'parent-en' }
    mergeSubtitles(parent, [{ locale: 'es', url: 'clip-es' }])
    expect(parent).toEqual({ en: 'parent-en' })
  })
})

describe('resolveThumbnailUrl', () => {
  const img = (url: string) => ({ id: 1, url } as { id: number; url: string })

  it('picks the primary override first', () => {
    expect(
      resolveThumbnailUrl({
        primaryOverride: img('primary-url'),
        secondaryOverride: img('secondary-url'),
        fallback: 'fallback-url',
      }),
    ).toBe('primary-url')
  })

  it('falls back to the secondary override when the primary is missing', () => {
    expect(
      resolveThumbnailUrl({
        primaryOverride: null,
        secondaryOverride: img('secondary-url'),
        fallback: 'fallback-url',
      }),
    ).toBe('secondary-url')
  })

  it('falls back to the fallback URL when both overrides are empty', () => {
    expect(
      resolveThumbnailUrl({
        primaryOverride: undefined,
        secondaryOverride: null,
        fallback: 'fallback-url',
      }),
    ).toBe('fallback-url')
  })

  it('returns null when nothing is supplied', () => {
    expect(resolveThumbnailUrl({})).toBeNull()
    expect(
      resolveThumbnailUrl({
        primaryOverride: null,
        secondaryOverride: null,
        fallback: null,
      }),
    ).toBeNull()
  })

  it('ignores number-only refs (depth:0 IDs have no url to extract)', () => {
    // At depth:1 the /api/lectures/for-audience endpoint always receives populated Image objects;
    // if it ever sees a raw number it cannot resolve a URL, so it must fall
    // through to the next tier.
    expect(
      resolveThumbnailUrl({
        primaryOverride: 42,
        secondaryOverride: img('secondary-url'),
        fallback: 'fallback-url',
      }),
    ).toBe('secondary-url')
  })

  it('supports lecture usage (primary-only, no secondary)', () => {
    // Lectures pass only `primaryOverride` (their own editor thumbnail) and
    // `fallback` (metadata.thumbnailUrl). `secondaryOverride` is unused.
    expect(
      resolveThumbnailUrl({
        primaryOverride: img('lecture-editor'),
        fallback: 'metadata-url',
      }),
    ).toBe('lecture-editor')
    expect(
      resolveThumbnailUrl({
        primaryOverride: null,
        fallback: 'metadata-url',
      }),
    ).toBe('metadata-url')
  })
})
