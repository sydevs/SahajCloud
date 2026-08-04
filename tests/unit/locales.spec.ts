/**
 * Locale Configuration Tests
 *
 * Tests for buildPayloadLocales() - the locale configuration builder.
 * This is separate from accessPlugin which handles permission-based locale filtering.
 */

import { describe, it, expect } from 'vitest'

import { buildPayloadLocales, languageToLocale } from '../../src/lib/locales'

// Build locales once for all tests
const allLocales = buildPayloadLocales()

describe('Locale Configuration (buildPayloadLocales)', () => {
  it('builds all 19 locales with proper configuration', () => {
    expect(allLocales).toHaveLength(19)
    expect(allLocales.map((l) => l.code)).toEqual([
      'en',
      'es',
      'de',
      'it',
      'fr',
      'ru',
      'ro',
      'cs',
      'uk',
      'el',
      'hy',
      'pl',
      'pt-BR',
      'fa',
      'bg',
      'tr',
      'en-AU',
      'hu',
      'nl',
    ])
  })

  it('sets RTL for Farsi locale', () => {
    const farsiLocale = allLocales.find((l) => l.code === 'fa')
    expect(farsiLocale?.rtl).toBe(true)
  })

  it('sets fallbackLocale to English for non-English locales', () => {
    const nonEnglishLocales = allLocales.filter((l) => l.code !== 'en')
    nonEnglishLocales.forEach((locale) => {
      expect(locale.fallbackLocale).toBe('en')
    })
  })

  it('does not set fallbackLocale for English', () => {
    const englishLocale = allLocales.find((l) => l.code === 'en')
    expect(englishLocale?.fallbackLocale).toBeUndefined()
  })

  it('has proper labels from ISO 639-1 or overrides', () => {
    const englishLocale = allLocales.find((l) => l.code === 'en')
    expect(englishLocale?.label).toBe('English')

    const germanLocale = allLocales.find((l) => l.code === 'de')
    expect(germanLocale?.label).toBe('German')

    // Check override for Brazilian Portuguese
    const ptBrLocale = allLocales.find((l) => l.code === 'pt-BR')
    expect(ptBrLocale?.label).toBe('Brazilian Portuguese')

    // Check override for Australian English
    const enAuLocale = allLocales.find((l) => l.code === 'en-AU')
    expect(enAuLocale?.label).toBe('Australian English')

    // Check override for Farsi
    const farsiLocale = allLocales.find((l) => l.code === 'fa')
    expect(farsiLocale?.label).toBe('Farsi/Persian')

    // ISO 639-1 labels for the newly added locales (no override needed)
    const hungarianLocale = allLocales.find((l) => l.code === 'hu')
    expect(hungarianLocale?.label).toBe('Hungarian')

    const dutchLocale = allLocales.find((l) => l.code === 'nl')
    expect(dutchLocale?.label).toBe('Dutch')
  })
})

describe('languageToLocale', () => {
  it('passes through a code that is already a CMS locale', () => {
    expect(languageToLocale('en')).toBe('en')
    expect(languageToLocale('cs')).toBe('cs')
    expect(languageToLocale('pt-BR')).toBe('pt-BR')
  })

  it('normalizes the loose spellings language fields and APIs use', () => {
    expect(languageToLocale('pt_BR')).toBe('pt-BR')
    expect(languageToLocale('pt-br')).toBe('pt-BR')
    expect(languageToLocale('EN_au')).toBe('en-AU')
  })

  it('treats bare Portuguese as Brazilian Portuguese, the only one configured', () => {
    expect(languageToLocale('pt')).toBe('pt-BR')
  })

  it('returns null for an unset language or one the CMS has no locale for', () => {
    // A manager picks from every ISO 639-1 language, most of which the CMS
    // isn't translated into; the caller falls back to the default locale.
    expect(languageToLocale('sw')).toBeNull()
    expect(languageToLocale('')).toBeNull()
    expect(languageToLocale(null)).toBeNull()
    expect(languageToLocale(undefined)).toBeNull()
  })
})
