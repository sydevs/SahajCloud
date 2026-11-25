import { describe, expect, it } from 'vitest'

import { slugifyValue } from '../../src/fields/slugify'

describe('slugifyValue', () => {
  it('transliterates Cyrillic to ASCII', () => {
    expect(slugifyValue('Москва')).toBe('moskva')
    expect(slugifyValue('Санкт-Петербург')).toBe('sankt-peterburg')
    expect(slugifyValue('Воронеж')).toBe('voronezh')
  })

  it('strips diacritics from Latin names', () => {
    expect(slugifyValue('São Paulo')).toBe('sao-paulo')
  })

  it('spells umlauts and ß the German way', () => {
    expect(slugifyValue('Universität Trier')).toBe('universitaet-trier')
    expect(slugifyValue('ÄÖÜ äöü')).toBe('aeoeue-aeoeue')
    expect(slugifyValue('Straße')).toBe('strasse')
  })

  it('treats a combining diaeresis as the umlaut it spells', () => {
    expect(slugifyValue('Ku\u0308che')).toBe('kueche')
  })

  it("spells symbols in English, not slugify's German locale", () => {
    expect(slugifyValue('Yoga & Ruhe | 50%')).toBe('yoga-and-ruhe-or-50percent')
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
