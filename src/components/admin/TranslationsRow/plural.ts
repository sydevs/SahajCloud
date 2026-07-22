/**
 * Locale-aware plural helpers for the admin translation row.
 *
 * A `plural: true` key is stored as its CLDR family (`<key>_one`/`_few`/…). When
 * editing a locale, the row only needs the categories *that locale* actually
 * uses — English has one/other; Russian/Ukrainian/Czech add few/many — so we ask
 * `Intl.PluralRules` (the platform's CLDR data) rather than hardcoding per-
 * language rules. This mirrors the resolver-side `pluralize` in `emailStrings.ts`.
 */

/** Canonical display order (a superset; `Intl` returns them unordered). */
const CATEGORY_ORDER = ['zero', 'one', 'two', 'few', 'many', 'other'] as const

/** The plural categories the given locale uses, in a stable display order. */
export function pluralCategoriesForLocale(localeCode: string): string[] {
  const used = new Intl.PluralRules(localeCode).resolvedOptions().pluralCategories
  return CATEGORY_ORDER.filter((category) => used.includes(category))
}

/**
 * A representative count for a category in a locale (e.g. Russian `few` → 2),
 * so the input can hint "the count it is for". Returns `null` for a category no
 * whole number selects (e.g. Russian `other`, Czech `many` — fractions only).
 */
export function pluralExampleForCategory(localeCode: string, category: string): number | null {
  const rules = new Intl.PluralRules(localeCode)
  for (let n = 1; n <= 200; n++) {
    if (rules.select(n) === category) return n
  }
  return null
}
