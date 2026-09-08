/**
 * Unit tests for `lengthStatus` — the pure helper behind the admin translation
 * row's character-length indicator. The limit is advisory by default (an
 * over-length value still saves) and blocking for a `strict` key, whose limit
 * the field's JSON Schema enforces. This only computes the display state.
 */
import { describe, expect, it } from 'vitest'

import { lengthStatus } from '@/components/admin/TranslationsRow/lengthStatus'

describe('lengthStatus', () => {
  it('returns null when there is no limit', () => {
    expect(lengthStatus('anything')).toBeNull()
    expect(lengthStatus('anything', undefined)).toBeNull()
  })

  it('treats a non-positive limit as no limit', () => {
    expect(lengthStatus('x', 0)).toBeNull()
    expect(lengthStatus('x', -5)).toBeNull()
  })

  it('reports an under-limit value without the over flag', () => {
    // "Get Directions" is 14 chars, limit 24.
    expect(lengthStatus('Get Directions', 24)).toEqual({
      maxLength: 24,
      length: 14,
      over: false,
      blocking: false,
    })
  })

  it('is not over when the value exactly fills the limit', () => {
    // "twelve chars" is 12 chars.
    expect(lengthStatus('twelve chars', 12)).toEqual({
      maxLength: 12,
      length: 12,
      over: false,
      blocking: false,
    })
  })

  it('flags an over-limit value with its live length', () => {
    // "Unsubscribe from these reminders" is 32 chars, limit 20.
    expect(lengthStatus('Unsubscribe from these reminders', 20)).toEqual({
      maxLength: 20,
      length: 32,
      over: true,
      blocking: false,
    })
  })

  it('uses the longest across several values (plural row shares one counter)', () => {
    // Longest is "8 занятий" (9 chars) → over a limit of 8.
    expect(lengthStatus(['1 занятие', '8 занятий', '2 занятия'], 8)).toEqual({
      maxLength: 8,
      length: 9,
      over: true,
      blocking: false,
    })
    // An empty array (or all-empty values) measures 0.
    expect(lengthStatus([], 8)).toEqual({ maxLength: 8, length: 0, over: false, blocking: false })
  })

  // A `strict` key's limit is emitted into the field's JSON Schema, so Payload
  // refuses the save. `blocking` is what turns the row's warning into an error
  // — without it the admin promises a save the server is about to reject.
  it('blocks only when the key is strict AND the value is over', () => {
    expect(lengthStatus('four', 12, true)).toEqual({
      maxLength: 12,
      length: 4,
      over: false,
      blocking: false,
    })
    expect(lengthStatus('far too long for this', 12, true)).toEqual({
      maxLength: 12,
      length: 21,
      over: true,
      blocking: true,
    })
  })

  it('defaults to advisory when strict is not passed', () => {
    expect(lengthStatus('far too long for this', 12)?.blocking).toBe(false)
  })

  it('blocks on the longest value of a plural row, not the first', () => {
    // Only "8 занятий" (9) exceeds 8 — the row still blocks.
    expect(lengthStatus(['1 занятие', '8 занятий'], 8, true)?.blocking).toBe(true)
  })

  it('counts Unicode code points, not UTF-16 units', () => {
    // '👍' is one code point but two UTF-16 units. It fits a limit of 1.
    expect(lengthStatus('👍', 1)).toEqual({
      maxLength: 1,
      length: 1,
      over: false,
      blocking: false,
    })
  })
})
