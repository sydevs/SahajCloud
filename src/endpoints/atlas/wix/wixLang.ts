import type { LocaleCode } from '@/lib/locales'
import { baseLanguage, DEFAULT_LOCALE, isValidLocale, LOCALES } from '@/lib/locales'

/**
 * Which of the nineteen SEO locales a Wix language code names.
 *
 * ⚠ **Wix hands the router a language, and we answer in a locale.** The two are
 * not the same vocabulary: a Multilingual site's `request.baseUrl` ends in
 * `/fr/`, so the router reads `fr` — a bare ISO 639-1 subtag, never `pt-BR` or
 * `en-AU`. Two of our nineteen are regional variants with no bare form, so a
 * straight `isValidLocale` check would send every Portuguese and Australian
 * page to English.
 *
 * The ladder, in order:
 *
 * 1. An exact locale code, for a router configured with one (`pt-BR`).
 * 2. The first locale whose own language matches — `pt` → `pt-BR`, `en` → `en`.
 *    Declaration order in `LOCALES` decides, which is why `en` precedes
 *    `en-AU` there: a bare subtag should resolve to the unmarked variant.
 * 3. The default locale. An unknown language is not an error — the page still
 *    has to render, and English is what the widget itself falls back to.
 */
export function localeFromWixLang(lang: string | undefined): LocaleCode {
  if (!lang) return DEFAULT_LOCALE
  if (isValidLocale(lang)) return lang

  const subtag = lang.split('-')[0].toLowerCase()
  const match = LOCALES.find((locale) => baseLanguage(locale.code) === subtag)
  return match?.code ?? DEFAULT_LOCALE
}
