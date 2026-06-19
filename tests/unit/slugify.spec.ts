import { describe, expect, it } from 'vitest'

import { slugifyValue } from '../../src/lib/utilities/slugify'

describe('slugifyValue', () => {
  it('transliterates Cyrillic to ASCII', () => {
    expect(slugifyValue('Москва')).toBe('moskva')
    expect(slugifyValue('Санкт-Петербург')).toBe('sankt-peterburg')
    expect(slugifyValue('Воронеж')).toBe('voronezh')
  })

  it('strips diacritics from Latin names', () => {
    expect(slugifyValue('São Paulo')).toBe('sao-paulo')
  })

  it('lowercases and hyphenates spaces', () => {
    expect(slugifyValue('Rio De Janeiro')).toBe('rio-de-janeiro')
    expect(slugifyValue('Georgia')).toBe('georgia')
  })

  it('returns an empty string for blank/nullish input', () => {
    expect(slugifyValue('')).toBe('')
    expect(slugifyValue(null)).toBe('')
    expect(slugifyValue(undefined)).toBe('')
  })
})
