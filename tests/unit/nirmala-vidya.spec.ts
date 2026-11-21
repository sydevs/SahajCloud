/**
 * Nirmala Vidya API language-code mapping tests.
 *
 * lectureDateFromTitle() reads the day a talk was given out of the NV title,
 * the only place NV states it.
 *
 * apiLanguageToLocale() normalizes NV subtitle language codes to CMS locale
 * codes. Compound codes must resolve to BCP-47 form (lowercase language,
 * uppercase region) and never the old, now-invalid 'pt-br' spelling.
 */

import { describe, it, expect } from 'vitest'

import { apiLanguageToLocale, lectureDateFromTitle } from '../../src/lib/lectures/nirmalaVidya'

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

describe('lectureDateFromTitle', () => {
  // The two shapes production's own NV titles use, 68 and 8 of 77 full
  // lectures respectively.
  it('reads the parenthesised date NV appends', () => {
    expect(lectureDateFromTitle('The Last Breakthrough in Human Evolution (1990-03-16)')).toBe(
      '1990-03-16T12:00:00.000Z',
    )
  })

  it('reads the date NV puts in front of the title', () => {
    expect(lectureDateFromTitle('1989-08-01 First Know Thyself, London, DP-RAW')).toBe(
      '1989-08-01T12:00:00.000Z',
    )
  })

  // Noon UTC is the hour Payload's day-only picker stores, so a derived value
  // and a legacy editor-entered one answer the same UTC date part.
  it('stores noon UTC, so the UTC date part is the day of the talk', () => {
    expect(lectureDateFromTitle('A talk (1979-03-18)')).toBe('1979-03-18T12:00:00.000Z')
  })

  it('refuses a malformed date rather than guessing at it', () => {
    // The one production title that states no parseable date: an upstream typo
    // for 1980-04-21. Guessing a hyphen's position would invent a date.
    expect(lectureDateFromTitle('1980-0421 What Is The Second Birth London NITL HD')).toBeNull()
  })

  // ⚠ V8 rolls these over instead of refusing them — `1990-02-31` parses as
  // 3 March — so only a round trip rejects them.
  it('refuses a day or month no calendar holds', () => {
    expect(lectureDateFromTitle('A talk (1990-02-31)')).toBeNull()
    expect(lectureDateFromTitle('A talk (1990-13-01)')).toBeNull()
  })

  it('reads no date out of a bare year or a run of digits', () => {
    expect(lectureDateFromTitle('Interview with Shri Mataji, Australia 1990')).toBeNull()
    expect(lectureDateFromTitle('Tape 19900316, Bordi')).toBeNull()
  })

  // The year bound is what separates a date from a hyphenated id of the same
  // shape. No talk predates it, so nothing legitimate is refused.
  it('reads no date out of a hyphenated id shaped like one', () => {
    expect(lectureDateFromTitle('Reel 0012-34-56, Bordi')).toBeNull()
    expect(lectureDateFromTitle('Catalogue 1842-07-01 reprint')).toBeNull()
  })

  it('answers null for a title NV has not supplied', () => {
    expect(lectureDateFromTitle(undefined)).toBeNull()
    expect(lectureDateFromTitle(null)).toBeNull()
    expect(lectureDateFromTitle('')).toBeNull()
  })
})
