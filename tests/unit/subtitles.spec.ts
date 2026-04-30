import { describe, expect, it } from 'vitest'

import { parseSubtitles } from '@/lib/subtitles'

describe('parseSubtitles', () => {
  const validSubtitles = {
    captions: [
      { duration: 1.5, content: 'Hello', startTime: '00:00:00.000' },
      { duration: 2, content: 'World', startTime: '00:00:01.500' },
    ],
  }

  it('accepts well-formed subtitles', () => {
    expect(parseSubtitles(validSubtitles)).toBe(true)
  })

  it('treats undefined / null / empty object / empty array as valid (field is optional)', () => {
    expect(parseSubtitles(undefined)).toBe(true)
    expect(parseSubtitles(null)).toBe(true)
    expect(parseSubtitles({})).toBe(true)
    expect(parseSubtitles([])).toBe(true)
  })

  it('rejects payloads missing the required `captions` key', () => {
    const result = parseSubtitles({ notCaptions: [] })
    expect(typeof result).toBe('string')
    expect(result as string).toContain('captions')
  })

  it('rejects when a caption is missing a required field', () => {
    const result = parseSubtitles({
      captions: [{ duration: 1, content: 'no startTime' }],
    })
    expect(typeof result).toBe('string')
    expect(result as string).toContain('startTime')
  })

  it('rejects when a caption field has the wrong type', () => {
    const result = parseSubtitles({
      captions: [{ duration: '10', content: 'oops', startTime: '00:00:00.000' }],
    })
    expect(typeof result).toBe('string')
    expect(result as string).toMatch(/captions\.0\.duration/)
  })

  it('rejects when `captions` is not an array', () => {
    const result = parseSubtitles({ captions: 'not-an-array' })
    expect(typeof result).toBe('string')
    expect(result as string).toContain('captions')
  })

  it('rejects a top-level non-object value', () => {
    expect(typeof parseSubtitles('a string')).toBe('string')
    expect(typeof parseSubtitles(42)).toBe('string')
  })
})
