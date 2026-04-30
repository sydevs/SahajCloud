import { describe, expect, it } from 'vitest'

import { validateSubtitles } from '@/lib/subtitles'

// Payload calls validate with a second `options` argument we don't read; cast
// to `any` so the unit tests don't need to fabricate a full ValidateOptions.
const validate = (value: unknown) => (validateSubtitles as any)(value, {})

describe('validateSubtitles', () => {
  const validSubtitles = {
    captions: [
      { duration: 1.5, content: 'Hello', startTime: '00:00:00.000' },
      { duration: 2, content: 'World', startTime: '00:00:01.500' },
    ],
  }

  it('accepts well-formed subtitles', () => {
    expect(validate(validSubtitles)).toBe(true)
  })

  it('treats undefined / null / empty object / empty array as valid (field is optional)', () => {
    expect(validate(undefined)).toBe(true)
    expect(validate(null)).toBe(true)
    expect(validate({})).toBe(true)
    expect(validate([])).toBe(true)
  })

  it('rejects payloads missing the required `captions` key', () => {
    const result = validate({ notCaptions: [] })
    expect(typeof result).toBe('string')
    expect(result as string).toContain('captions')
  })

  it('rejects when a caption is missing a required field', () => {
    const result = validate({
      captions: [{ duration: 1, content: 'no startTime' }],
    })
    expect(typeof result).toBe('string')
    expect(result as string).toContain('startTime')
  })

  it('rejects when a caption field has the wrong type', () => {
    const result = validate({
      captions: [{ duration: '10', content: 'oops', startTime: '00:00:00.000' }],
    })
    expect(typeof result).toBe('string')
    expect(result as string).toMatch(/captions\.0\.duration/)
  })

  it('rejects when `captions` is not an array', () => {
    const result = validate({ captions: 'not-an-array' })
    expect(typeof result).toBe('string')
    expect(result as string).toContain('captions')
  })

  it('rejects a top-level non-object value', () => {
    expect(typeof validate('a string')).toBe('string')
    expect(typeof validate(42)).toBe('string')
  })
})
