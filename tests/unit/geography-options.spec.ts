import { describe, expect, it } from 'vitest'

import { getCountryOptions, getRegionOptions } from '@/lib/geography'

describe('getCountryOptions', () => {
  const options = getCountryOptions()

  it('returns the country set as { label, value } pairs', () => {
    expect(options.length).toBeGreaterThan(200)
    for (const option of options) {
      expect(option.value).toMatch(/^[A-Z]{2}$/) // ISO 3166-1 alpha-2
      expect(option.label.length).toBeGreaterThan(0)
    }
  })

  it('includes well-known countries keyed by alpha-2 code', () => {
    expect(options).toContainEqual({ label: 'United States', value: 'US' })
    expect(options).toContainEqual({ label: 'United Kingdom', value: 'GB' })
  })

  it('is sorted alphabetically by label', () => {
    const labels = options.map((o) => o.label)
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)))
  })

  it('has unique values', () => {
    const values = options.map((o) => o.value)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('getRegionOptions', () => {
  it('returns the subdivisions of a country by alpha-2 code', () => {
    const usRegions = getRegionOptions('US')
    expect(usRegions).toContainEqual({ label: 'California', value: 'CA' })
    expect(usRegions.length).toBeGreaterThan(50)
  })

  it('returns an empty array for unknown / empty country codes', () => {
    expect(getRegionOptions('ZZ')).toEqual([])
    expect(getRegionOptions('')).toEqual([])
    expect(getRegionOptions(null)).toEqual([])
    expect(getRegionOptions(undefined)).toEqual([])
  })
})
