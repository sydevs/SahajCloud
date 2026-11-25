import { describe, expect, it } from 'vitest'

import { slugifyAnchor, slugifyValue } from '../../src/fields/slugify'

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
    expect(slugifyValue('Köln')).toBe('koeln')
    expect(slugifyValue('Zürich')).toBe('zuerich')
    expect(slugifyValue('ÄÖÜ äöü')).toBe('aeoeue-aeoeue')
    expect(slugifyValue('Straße')).toBe('strasse')
  })

  it('treats a combining diaeresis as the umlaut it spells', () => {
    expect(slugifyValue('Küche')).toBe('kueche')
  })

  it('leaves symbols alone', () => {
    expect(slugifyValue('Yoga & Meditation')).toBe('yoga-and-meditation')
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

describe('slugifyAnchor', () => {
  it('keeps the pre-umlaut spelling, so shared anchors still resolve', () => {
    expect(slugifyAnchor('Über uns')).toBe('uber-uns')
  })
})
