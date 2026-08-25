/**
 * The locales the Sahaj Atlas widget ships UI bundles for — the hreflang set
 * for every atlas page.
 *
 * **This list is `supportedLanguages` in sydevs/SahajAtlasWeb
 * `src/config/i18n-options.ts`**, which is in turn that repo's
 * `public/locales/` directory. It is a strict subset of the CMS's own locales
 * (`@/lib/locales`), and `tests/unit/atlas-seo-document.spec.ts` fails if an
 * entry here stops being one — a code with no CMS locale behind it would put a
 * page into an hreflang cluster whose members serve nothing.
 *
 * Duplicated rather than derived from `@/lib/locales`, because the two lists
 * answer different questions: the CMS is *translated into* 19 locales, the
 * widget *renders in* 10, and an hreflang cluster must name pages a visitor can
 * actually read.
 *
 * Kept in a module of its own so the OpenAPI shim can document the set without
 * importing the shaper — which would pull the Lexical converter into the unit
 * lane for a list of ten strings.
 */
export const ATLAS_WIDGET_LOCALES = [
  'cs',
  'de',
  'en',
  'es',
  'fr',
  'hu',
  'nl',
  'pt-BR',
  'ru',
  'uk',
] as const
