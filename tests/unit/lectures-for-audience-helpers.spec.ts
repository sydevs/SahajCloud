import { describe, expect, it } from 'vitest'

import { mergeSubtitles } from '@/lib/lectures/lectureShape'
import type { Lecture } from '@/payload-types'


/** The `overrides` argument's own type, so locale codes are checked. */
type SubtitleOverrides = NonNullable<Lecture['subtitles']>

describe('mergeSubtitles', () => {
  it('returns the base map unchanged when there are no overrides', () => {
    const base = { en: 'base-en', es: 'base-es' }
    expect(mergeSubtitles(base, undefined)).toEqual(base)
    expect(mergeSubtitles(base, null)).toEqual(base)
    expect(mergeSubtitles(base, [])).toEqual(base)
  })

  it('layers each non-empty override on top of the base map', () => {
    const base = { en: 'base-en', es: 'base-es', de: 'base-de' }
    const overrides: SubtitleOverrides = [
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
    const overrides: SubtitleOverrides = [
      { locale: 'en', url: '' },
      { locale: 'es', url: 'override-es' },
    ]
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
