/**
 * Unit tests for `budgetStatus` — the pure helper behind the admin translation
 * row's soft character-budget indicator. The budget is advisory (an over-budget
 * value still saves), so this only computes the display state.
 */
import { describe, expect, it } from 'vitest'

import { budgetStatus } from '@/components/admin/TranslationsRow/charBudget'

describe('budgetStatus', () => {
  it('returns null when there is no budget', () => {
    expect(budgetStatus('anything')).toBeNull()
    expect(budgetStatus('anything', undefined)).toBeNull()
  })

  it('treats a non-positive budget as no budget', () => {
    expect(budgetStatus('x', 0)).toBeNull()
    expect(budgetStatus('x', -5)).toBeNull()
  })

  it('reports an under-budget value without the over flag', () => {
    // "Get Directions" is 14 chars, budget 24.
    expect(budgetStatus('Get Directions', 24)).toEqual({ budget: 24, length: 14, over: false })
  })

  it('is not over when the value exactly fills the budget', () => {
    // "twelve chars" is 12 chars.
    expect(budgetStatus('twelve chars', 12)).toEqual({ budget: 12, length: 12, over: false })
  })

  it('flags an over-budget value with its live length', () => {
    // "Unsubscribe from these reminders" is 32 chars, budget 20.
    expect(budgetStatus('Unsubscribe from these reminders', 20)).toEqual({
      budget: 20,
      length: 32,
      over: true,
    })
  })

  it('counts Unicode code points, not UTF-16 units', () => {
    // '👍' is one code point but two UTF-16 units; it fits a budget of 1.
    expect(budgetStatus('👍', 1)).toEqual({ budget: 1, length: 1, over: false })
  })
})
