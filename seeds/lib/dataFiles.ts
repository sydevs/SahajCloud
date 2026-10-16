/**
 * The seed data files the CLI uploads in its POST body.
 *
 * ⚠ **A deployed route cannot read one off disk.** `next.config.mjs` drops
 * `seeds/**` from the production build trace (#471), so the CLI reads each
 * registered file locally and sends it as `inlineData`, keyed by the path
 * below; the importer consumes its own entry through
 * `loadJsonData({ localPath, inlineContent })`. Keyed differently on the two
 * sides — or left out of the registry altogether — a script works locally and
 * fails against every deployed target. So this module spells every such path,
 * and each importer takes its own from here.
 *
 * Pure data with no runtime import, so the CLI can read it without loading
 * `BaseImporter` and, through it, the whole Payload config.
 */
import type { ScriptName } from './expectedCounts'
import type { LocaleCode } from '../../src/lib/locales'

export const WM_APP_TRANSLATIONS_DATA_FILE = 'seeds/wm-app-translations/data.en.json'
export const WM_WEB_TRANSLATIONS_DATA_FILE = 'seeds/wm-web-translations/data.en.json'
export const MEDITATION_TRANSCRIPTS_DATA_FILE = 'seeds/meditation-transcripts/data.json'

/**
 * The locales `sy-atlas-translations` carries a seed file for. Each is
 * published on its own, and `sy-atlas-config.availableLocales` refuses a
 * locale whose translations are unpublished (#705) — so this list bounds the
 * languages the widget can offer.
 */
export const ATLAS_TRANSLATION_LOCALES = [
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
] as const satisfies readonly LocaleCode[]

export type AtlasTranslationLocale = (typeof ATLAS_TRANSLATION_LOCALES)[number]

export const atlasTranslationsDataFile = (locale: AtlasTranslationLocale): string =>
  `seeds/sy-atlas-translations/data.${locale}.json`

/** The eight pre-extracted dumps the atlas importer reads. */
export const ATLAS_DUMP_NAMES = [
  'users',
  'managers',
  'regions',
  'venues',
  'events',
  'registrations',
  'clients',
  'pictures',
] as const

export type AtlasDumpName = (typeof ATLAS_DUMP_NAMES)[number]

export const atlasDataFile = (name: AtlasDumpName): string => `seeds/atlas/data/${name}.json`

export const SCRIPT_DATA_FILES: Partial<Record<ScriptName, string[]>> = {
  'wm-app-translations': [WM_APP_TRANSLATIONS_DATA_FILE],
  translations: [
    WM_APP_TRANSLATIONS_DATA_FILE,
    WM_WEB_TRANSLATIONS_DATA_FILE,
    ...ATLAS_TRANSLATION_LOCALES.map(atlasTranslationsDataFile),
  ],
  'meditation-transcripts': [MEDITATION_TRANSCRIPTS_DATA_FILE],
  atlas: ATLAS_DUMP_NAMES.map(atlasDataFile),
}
