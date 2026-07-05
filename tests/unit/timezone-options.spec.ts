import { describe, expect, it } from 'vitest'

import { SUPPORTED_TIMEZONES } from '@/lib/timezones'

describe('SUPPORTED_TIMEZONES', () => {
  const options = SUPPORTED_TIMEZONES

  it('returns the bundled IANA zone set', () => {
    expect(options.length).toBeGreaterThan(40)
  })

  it('gives every option a non-empty IANA value and label', () => {
    for (const option of options) {
      expect(option.value.length).toBeGreaterThan(0)
      expect(option.label.length).toBeGreaterThan(0)
    }
  })

  it('includes well-known IANA zone values', () => {
    const values = options.map((o) => o.value)
    expect(values).toContain('Europe/London')
    expect(values).toContain('America/New_York')
    expect(values).toContain('Asia/Tokyo')
  })

  it('has unique values', () => {
    const values = options.map((o) => o.value)
    expect(new Set(values).size).toBe(values.length)
  })
})
