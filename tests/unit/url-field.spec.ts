import type { TextFieldSingleValidation } from 'payload'

import { describe, expect, it } from 'vitest'

import { urlField } from '@/fields/urlField'

// The factory's validator only reads `value`; the second arg is unused. It
// returns `TextField`, whose `validate` widens to the hasMany union — but the
// factory pins `hasMany: false`, so narrow to the single-value form it casts to.
const validatorFor = (options?: { protocols?: string[] }) => {
  const validate = urlField({ name: 'link', ...options }).validate as TextFieldSingleValidation
  return (value: unknown) => validate(value as string, undefined!)
}

describe('urlField validation', () => {
  const validate = validatorFor()

  it('accepts http and https URLs', () => {
    expect(validate('https://example.com/class')).toBe(true)
    expect(validate('http://example.com')).toBe(true)
    expect(validate('https://example.com/a/b?c=d#e')).toBe(true)
  })

  it('rejects a malformed URL', () => {
    expect(validate('not-a-url')).toBe('Please enter a valid URL')
  })

  it('rejects a disallowed protocol, naming the allowed ones', () => {
    expect(validate('ftp://example.com')).toBe('URL must start with http:// or https://')
  })

  // Empty values are the `required` flag's job, not the validator's — a blank
  // optional field (like Events.website) must pass.
  it('accepts empty values so optional fields can be left blank', () => {
    expect(validate('')).toBe(true)
    expect(validate(null)).toBe(true)
    expect(validate(undefined)).toBe(true)
  })

  it('honours a custom protocol list', () => {
    const mailto = validatorFor({ protocols: ['mailto:'] })
    expect(mailto('mailto:someone@example.com')).toBe(true)
    expect(mailto('https://example.com')).toBe('URL must start with mailto://')
  })
})
