/**
 * The languages the atlas launched with.
 *
 * **This is a seed and a fallback, not the source of truth.** That is the
 * `locales` field on the `sy-atlas-config` global (#645 follow-up), which an
 * operator owns. This constant fills two gaps around it, and one definition
 * serves both so they cannot drift:
 *
 * - the field's `defaultValue`, for an installation creating the global fresh;
 * - what `getAtlasLocales` answers when the stored value is empty.
 *
 * The second matters more than it looks. A field `defaultValue` applies when a
 * document is *created*, and this global's row already exists in production —
 * it has held the map centre and zoom for a while. Without a matching fallback
 * the column would deploy empty, and every atlas page's hreflang cluster would
 * silently collapse from ten languages to one: a real ranking change caused by
 * a deploy that was supposed to change nothing. With it, the deploy is a no-op
 * until somebody chooses otherwise, and no data migration is needed.
 *
 * The field is `required`, so an operator cannot save an empty set through the
 * admin — an empty column therefore only ever means "never configured", which
 * is exactly the case this should answer for.
 *
 * Historically this list was also `supportedLanguages` in sydevs/SahajAtlasWeb.
 * That duplication is what the global removes; the widget now reads the enabled
 * set from the CMS instead of declaring its own.
 */
export const ATLAS_DEFAULT_LOCALES = [
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
