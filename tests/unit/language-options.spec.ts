import { describe, expect, it } from 'vitest'

import { getLanguageOptions } from '@/lib/locales'

describe('getLanguageOptions', () => {
  const options = getLanguageOptions()

  it('returns the full ISO 639-1 set', () => {
    // iso-639-1 carries ~183 languages. Assert a healthy lower bound rather
    // than an exact count so a package bump does not break the suite.
    expect(options.length).toBeGreaterThan(150)
  })

  it('gives every option a two-letter code value and a non-empty label', () => {
    for (const option of options) {
      expect(option.value).toMatch(/^[a-z]{2}$/)
      expect(option.label.length).toBeGreaterThan(0)
    }
  })

  it('includes well-known languages keyed by ISO code', () => {
    expect(options).toContainEqual({ value: 'en', label: 'English' })
    expect(options).toContainEqual({ value: 'fr', label: 'French' })
    expect(options).toContainEqual({ value: 'de', label: 'German' })
  })

  it('is sorted alphabetically by label', () => {
    const labels = options.map((o) => o.label)
    const sorted = [...labels].sort((a, b) => a.localeCompare(b))
    expect(labels).toEqual(sorted)
  })

  it('has unique values', () => {
    const values = options.map((o) => o.value)
    expect(new Set(values).size).toBe(values.length)
  })
})
