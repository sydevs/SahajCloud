import { describe, expect, it } from 'vitest'

import { parseSubtitles } from '@/lib/subtitles'

describe('parseSubtitles', () => {
  const validSubtitles = [
    { startTimeMs: 0, endTimeMs: 1500, durationMs: 1500, content: 'Hello' },
    { startTimeMs: 1500, endTimeMs: 3500, content: 'World' },
  ]

  it('accepts well-formed subtitles', () => {
    expect(parseSubtitles(validSubtitles)).toBe(true)
  })

  it('treats undefined / null / empty object / empty array as valid (field is optional)', () => {
    expect(parseSubtitles(undefined)).toBe(true)
    expect(parseSubtitles(null)).toBe(true)
    expect(parseSubtitles({})).toBe(true)
    expect(parseSubtitles([])).toBe(true)
  })

  it('rejects top-level objects', () => {
    const result = parseSubtitles({ notSubtitles: [] })
    expect(typeof result).toBe('string')
    expect(result as string).toMatch(/array/i)
  })

  it('rejects when a subtitle is missing a required field', () => {
    const result = parseSubtitles([{ startTimeMs: 0, content: 'no endTimeMs' }])
    expect(typeof result).toBe('string')
    expect(result as string).toContain('endTimeMs')
  })

  it('rejects when a subtitle field has the wrong type', () => {
    const result = parseSubtitles([{ startTimeMs: '0', endTimeMs: 1000, content: 'oops' }])
    expect(typeof result).toBe('string')
    expect(result as string).toMatch(/0\.startTimeMs/)
  })

  it('rejects when the top-level value is not an array', () => {
    const result = parseSubtitles({ subtitles: 'not-an-array' })
    expect(typeof result).toBe('string')
    expect(result as string).toMatch(/array/i)
  })

  it('rejects top-level non-array values', () => {
    expect(typeof parseSubtitles('a string')).toBe('string')
    expect(typeof parseSubtitles(42)).toBe('string')
  })
})
