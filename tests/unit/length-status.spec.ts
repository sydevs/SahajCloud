/**
 * Unit tests for `lengthStatus` — the pure helper behind the admin translation
 * row's soft character-length indicator. The limit is advisory (an over-length
 * value still saves), so this only computes the display state.
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
    expect(lengthStatus('Get Directions', 24)).toEqual({ maxLength: 24, length: 14, over: false })
  })

  it('is not over when the value exactly fills the limit', () => {
    // "twelve chars" is 12 chars.
    expect(lengthStatus('twelve chars', 12)).toEqual({ maxLength: 12, length: 12, over: false })
  })

  it('flags an over-limit value with its live length', () => {
    // "Unsubscribe from these reminders" is 32 chars, limit 20.
    expect(lengthStatus('Unsubscribe from these reminders', 20)).toEqual({
      maxLength: 20,
      length: 32,
      over: true,
    })
  })

  it('uses the longest across several values (plural row shares one counter)', () => {
    // Longest is "8 занятий" (9 chars) → over a limit of 8.
    expect(lengthStatus(['1 занятие', '8 занятий', '2 занятия'], 8)).toEqual({
      maxLength: 8,
      length: 9,
      over: true,
    })
    // An empty array (or all-empty values) measures 0.
    expect(lengthStatus([], 8)).toEqual({ maxLength: 8, length: 0, over: false })
  })

  it('counts Unicode code points, not UTF-16 units', () => {
    // '👍' is one code point but two UTF-16 units; it fits a limit of 1.
    expect(lengthStatus('👍', 1)).toEqual({ maxLength: 1, length: 1, over: false })
  })
})
