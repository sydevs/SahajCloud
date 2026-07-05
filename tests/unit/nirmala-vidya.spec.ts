/**
 * Nirmala Vidya API language-code mapping tests.
 *
 * apiLanguageToLocale() normalizes NV subtitle language codes to CMS locale
 * codes. Compound codes must resolve to BCP-47 form (lowercase language,
 * uppercase region) and never the old, now-invalid 'pt-br' spelling.
 */

import { describe, it, expect } from 'vitest'

import { apiLanguageToLocale } from '../../src/lib/lectures/nirmalaVidya'

describe('apiLanguageToLocale', () => {
  it('passes an already-valid locale code through unchanged', () => {
    expect(apiLanguageToLocale('en')).toBe('en')
    expect(apiLanguageToLocale('de')).toBe('de')
    expect(apiLanguageToLocale('pt-BR')).toBe('pt-BR')
    expect(apiLanguageToLocale('en-AU')).toBe('en-AU')
  })

  it('normalizes compound codes to BCP-47 shape (uppercase region)', () => {
    // Underscore separator and/or a lowercased region must resolve to pt-BR.
    expect(apiLanguageToLocale('pt_BR')).toBe('pt-BR')
    expect(apiLanguageToLocale('pt-br')).toBe('pt-BR')
    expect(apiLanguageToLocale('en_AU')).toBe('en-AU')
    expect(apiLanguageToLocale('en-au')).toBe('en-AU')
  })

  it('normalizes an uppercased language subtag', () => {
    expect(apiLanguageToLocale('DE')).toBe('de')
    expect(apiLanguageToLocale('PT_br')).toBe('pt-BR')
  })

  it("maps bare 'pt' to Brazilian Portuguese", () => {
    expect(apiLanguageToLocale('pt')).toBe('pt-BR')
  })

  it("never produces the old invalid 'pt-br' spelling", () => {
    for (const code of ['pt', 'pt_BR', 'pt-BR', 'pt-br', 'PT']) {
      expect(apiLanguageToLocale(code)).toBe('pt-BR')
    }
  })

  it('returns null for unrecognized codes', () => {
    expect(apiLanguageToLocale('xx')).toBeNull()
    expect(apiLanguageToLocale('zh-Hant')).toBeNull()
    expect(apiLanguageToLocale('')).toBeNull()
  })
})
