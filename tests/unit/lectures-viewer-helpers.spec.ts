import { describe, expect, it } from 'vitest'

import { mergeSubtitles, resolveThumbnailUrl } from '@/endpoints/lecturesForViewer'

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

  it('picks the clip editor override first', () => {
    expect(
      resolveThumbnailUrl({
        clipOverride: img('clip-url'),
        parentOverride: img('parent-url'),
        parentMetadataUrl: 'metadata-url',
      }),
    ).toBe('clip-url')
  })

  it('falls back to the parent editor override when the clip has none', () => {
    expect(
      resolveThumbnailUrl({
        clipOverride: null,
        parentOverride: img('parent-url'),
        parentMetadataUrl: 'metadata-url',
      }),
    ).toBe('parent-url')
  })

  it('falls back to parent metadata URL when both editor overrides are empty', () => {
    expect(
      resolveThumbnailUrl({
        clipOverride: undefined,
        parentOverride: null,
        parentMetadataUrl: 'metadata-url',
      }),
    ).toBe('metadata-url')
  })

  it('returns null when nothing is supplied', () => {
    expect(resolveThumbnailUrl({})).toBeNull()
    expect(
      resolveThumbnailUrl({
        clipOverride: null,
        parentOverride: null,
        parentMetadataUrl: null,
      }),
    ).toBeNull()
  })

  it('ignores number-only refs (depth:0 IDs have no url to extract)', () => {
    // At depth:1 the viewer endpoint always receives populated Image objects;
    // if it ever sees a raw number it cannot resolve a URL, so it must fall
    // through to the next tier.
    expect(
      resolveThumbnailUrl({
        clipOverride: 42,
        parentOverride: img('parent-url'),
        parentMetadataUrl: 'metadata-url',
      }),
    ).toBe('parent-url')
  })
})
