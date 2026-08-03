/**
 * Unit tests for the admin plural helpers — which CLDR categories a locale's
 * translation row shows, and the example count each label hints at.
 */
import { describe, expect, it } from 'vitest'

import {
  pluralCategoriesForLocale,
  pluralExampleForCategory,
} from '@/components/admin/TranslationsRow/plural'

describe('pluralCategoriesForLocale', () => {
  it('returns only the categories a locale uses, in display order', () => {
    expect(pluralCategoriesForLocale('en')).toEqual(['one', 'other'])
    expect(pluralCategoriesForLocale('ru')).toEqual(['one', 'few', 'many', 'other'])
    expect(pluralCategoriesForLocale('uk')).toEqual(['one', 'few', 'many', 'other'])
    expect(pluralCategoriesForLocale('cs')).toEqual(['one', 'few', 'many', 'other'])
    expect(pluralCategoriesForLocale('fr')).toEqual(['one', 'many', 'other'])
  })
})

describe('pluralExampleForCategory', () => {
  it('returns a representative whole number for a category', () => {
    expect(pluralExampleForCategory('en', 'one')).toBe(1)
    expect(pluralExampleForCategory('en', 'other')).toBe(2)
    expect(pluralExampleForCategory('ru', 'few')).toBe(2)
    expect(pluralExampleForCategory('ru', 'many')).toBe(5)
    expect(pluralExampleForCategory('cs', 'other')).toBe(5)
  })

  it('returns null for a category no whole number selects (fraction-only)', () => {
    // Russian `other` and Czech `many` only apply to fractional counts.
    expect(pluralExampleForCategory('ru', 'other')).toBeNull()
    expect(pluralExampleForCategory('cs', 'many')).toBeNull()
  })
})
