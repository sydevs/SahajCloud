/**
 * The locale set a web project offers, as an operator saved it on that
 * project's config global (`availableLocales`).
 *
 * Pure, and split from the field itself, because the interesting cases are
 * **states the API cannot produce**. The field is `required` and always
 * contains `en`, so an empty or malformed stored value only ever means the
 * column predates the field — which is exactly what production looks like the
 * moment this deploys, and is untestable through `updateGlobal`.
 */

import type { LocaleCode } from '@/lib/locales'
import { DEFAULT_LOCALE, isValidLocale } from '@/lib/locales'

/**
 * Normalize whatever is stored into a usable locale list: valid codes only,
 * de-duplicated, original order kept. Returns `[]` when nothing is usable.
 *
 * Codes are validated rather than trusted. A locale later removed from
 * `LOCALES` in code would otherwise survive in stored data and be published as
 * an `hreflang` alternate for a language the CMS can no longer render.
 * Duplicates are dropped for the same reason — a repeated `hreflang` is invalid
 * markup.
 */
export function parseAvailableLocales(stored: unknown): LocaleCode[] {
  if (!Array.isArray(stored)) return []

  const seen = new Set<string>()
  const locales: LocaleCode[] = []
  for (const entry of stored) {
    if (typeof entry !== 'string') continue
    if (!isValidLocale(entry) || seen.has(entry)) continue
    seen.add(entry)
    locales.push(entry)
  }
  return locales
}

/**
 * The same list, with the unconfigured case answered.
 *
 * A field `defaultValue` applies when a document is *created*, and both config
 * globals' rows already exist in production. So an unconfigured column must
 * mean something safe rather than nothing: English alone, which every project
 * has and which no consumer can be surprised by.
 *
 * This deliberately does **not** fall back to a launch set. A wider fallback
 * would tell a crawler that nine more languages have pages before an operator
 * has said any of them are translated — the exact promise `availableLocales`
 * exists to stop us making.
 */
export function readAvailableLocales(stored: unknown): LocaleCode[] {
  const locales = parseAvailableLocales(stored)
  return locales.length > 0 ? locales : [DEFAULT_LOCALE]
}
