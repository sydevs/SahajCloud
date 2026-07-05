/**
 * Locale Configuration Tests
 *
 * Tests for buildPayloadLocales() - the locale configuration builder.
 * This is separate from accessPlugin which handles permission-based locale filtering.
 */

import { describe, it, expect } from 'vitest'

import { buildPayloadLocales } from '../../src/lib/locales'

// Build locales once for all tests
const allLocales = buildPayloadLocales()

describe('Locale Configuration (buildPayloadLocales)', () => {
  it('builds all 17 locales with proper configuration', () => {
    expect(allLocales).toHaveLength(17)
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
  })
})
