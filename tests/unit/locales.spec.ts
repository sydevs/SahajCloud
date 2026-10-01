/**
 * Locale Configuration Tests
 *
 * Tests for buildPayloadLocales() - the locale configuration builder.
 * This is separate from accessPlugin which handles permission-based locale filtering.
 */

import { describe, it, expect } from 'vitest'

import { baseLanguage, buildPayloadLocales, getLanguageOptions } from '../../src/lib/locales'

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

describe('baseLanguage', () => {
  const languages = new Set(getLanguageOptions().map((option) => option.value))

  it('answers with the ISO 639-1 language, not the locale code', () => {
    expect(baseLanguage('pt-BR')).toBe('pt')
    expect(baseLanguage('en-AU')).toBe('en')
    expect(baseLanguage('cs')).toBe('cs')
  })

  it('answers every configured locale with a language the pickers accept', () => {
    // The point of the helper: `pt-BR` and `en-AU` are locales ISO 639-1 has no
    // code for, so a caller passing the locale straight into one of these fields
    // would be refused at write.
    for (const { code } of buildPayloadLocales()) {
      expect(languages.has(baseLanguage(code)), `${code} -> ${baseLanguage(code)}`).toBe(true)
    }
  })

  it('falls back to the default locale for anything that is not a locale', () => {
    // ⚠ `req.locale` is request-supplied. `?locale=all` arrives as 'all', whose
    // base subtag is 'all' — not a language, and not a value these fields take.
    for (const code of ['all', 'union', 'zz-ZZ', '', undefined]) {
      expect(languages.has(baseLanguage(code)), `${String(code)}`).toBe(true)
    }
    expect(baseLanguage('all')).toBe('en')
  })
})
