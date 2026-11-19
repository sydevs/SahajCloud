/**
 * Translations Seed — all three translation globals
 *
 * Seeds every translation global:
 *   wm-app-translations   → real copy from seeds/wm-app-translations/data.en.json
 *   wm-web-translations   → real copy from seeds/wm-web-translations/data.en.json,
 *                           published in English
 *   sy-atlas-translations → the widget's own shipped copy, in all ten locales,
 *                           each published individually
 *
 * No global is seeded from generated strings any more. #706 replaced the
 * atlas global's placeholders with real copy and #707 replaced wm-web's, so
 * `generateExampleData` lost its last caller and went with them.
 *
 * Idempotent — re-running overwrites the seeded locales' values. For the atlas
 * global the two groups holding live production data (`emails` and
 * `event.title`) are never overwritten: no seed file carries them, and English
 * defaults fill only a key that is currently blank.
 *
 * `wm-web-translations` is additionally **published in English** (#707), so
 * the CMS's own answer to "is English published?" matches the copy it holds.
 * Its `_status` is per-locale (`localizeStatus`, #705), so publishing `en`
 * leaves every other locale a draft.
 *
 * ⚠ It is NOT what lets `wm-web-config.availableLocales` offer `en`. English
 * is exempt from that field's publish gate by design — gating the one locale
 * nobody can deselect would deadlock the save (`availableLocalesField.ts`).
 * Nor does it change what a read returns: a global read comes back identical
 * whether `draft` is true, false, or unset. The publish sets state, and state
 * is what an operator and the admin go by.
 *
 * `wm-app-translations` keeps the plain update. Its `_status` is per-locale
 * too since #709, so a publish here would be safe — but its copy is live app
 * content, and an operator republishes each locale after the deploy.
 *
 * Usage:
 *   pnpm seed:dev translations --dry-run
 *   pnpm seed:dev translations
 */

import type { LocaleCode } from '../../src/lib/locales'

import * as path from 'path'

import { TRANSLATIONS_TARGETS } from '../../src/globals'
import appSchema from '../../src/globals/WeMeditateAppTranslations/translationsSchema.json' with { type: 'json' }
import { EVENT_TITLE_DEFAULTS } from '../../src/lib/eventTitle/compose'
import { EMAILS_GROUP_DEFAULTS } from '../../src/lib/translations/emailStrings'
import { withEnglishDefaults } from '../../src/lib/translations/englishDefaults'
import { BaseImporter, type BaseImportOptions } from '../lib'
import {
  ATLAS_TRANSLATION_LOCALES as ATLAS_LOCALES,
  type AtlasTranslationLocale as AtlasLocale,
  atlasTranslationsDataFile,
  WM_APP_TRANSLATIONS_DATA_FILE as WM_APP_SEED_LOCAL_PATH,
  WM_WEB_TRANSLATIONS_DATA_FILE as WM_WEB_SEED_LOCAL_PATH,
} from '../lib/dataFiles'
import {
  buildWmAppGlobalData,
  collectSeedTodos,
  type SeedFile,
  type TranslationsSchemaRoot,
} from '../wm-app-translations/lexicalConverter'

// --- Preserving the two groups that hold live data ---

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/**
 * Merges English defaults into a stored JSON group, filling only the keys that
 * are missing or blank.
 *
 * The whole merged object is returned, not just the filled keys, because a JSON
 * column is replaced wholesale on write: sending only the blanks would delete
 * every translated value beside them. That is exactly the data — registrant
 * email chrome and the CMS auto-titles — this seed must never touch.
 */
function fillBlanks(
  stored: unknown,
  defaults: Record<string, string>,
): Record<string, unknown> | undefined {
  const current = asRecord(stored) ?? {}
  const merged: Record<string, unknown> = { ...current }

  for (const [key, fallback] of Object.entries(defaults)) {
    const value = current[key]
    if (typeof value !== 'string' || value.trim().length === 0) merged[key] = fallback
  }

  return Object.keys(merged).length > 0 ? merged : undefined
}

// --- Seed definitions ---

const DEFAULT_LOCALE: LocaleCode = 'en'

/**
 * The wm-web seed file, minus its `_meta` header, IS the `updateGlobal` data:
 * `<tab>.<sub-group>.<key>` for a nested tab, `<tab>.<key>` for a flat one.
 * Nothing transforms it, which is the point — a key the schema does not
 * declare is refused by name rather than silently dropped.
 *
 * That refusal reaches inside a leaf group only. Payload ignores an unknown
 * TOP-LEVEL key on a global, so `_meta` would pass through unnoticed either
 * way — it is stripped for the reader's sake, not the database's. The pin on
 * the file's own contents is `tests/unit/wm-web-translations-seed.spec.ts`.
 */
type WmWebSeedFile = { _meta?: unknown } & Record<string, unknown>

/**
 * An atlas `data.<locale>.json` seed file: the global's own data shape, plus a
 * `_meta` header the writer strips.
 */
type LocaleSeedFile = { _meta?: { locale?: unknown } } & Record<string, unknown>

// --- Importer ---

export class TranslationsImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'Translations (all three globals; the atlas in ten locales)'
  protected readonly cacheDir = path.resolve(process.cwd(), 'seeds/cache/translations')

  protected async import(): Promise<void> {
    await this.seedWmApp()
    await this.seedWmWeb()
    await this.seedAtlas()
  }

  // --- wm-app-translations: real English copy from data.en.json ---

  private async seedWmApp(): Promise<void> {
    const slug = 'wm-app-translations'

    const { loadJsonData } = await import('../lib/dataLoader')
    const seed = await loadJsonData<SeedFile>({
      localPath: WM_APP_SEED_LOCAL_PATH,
      inlineContent: this.options.inlineData?.[WM_APP_SEED_LOCAL_PATH],
    })

    let data: Record<string, unknown>
    try {
      data = buildWmAppGlobalData(seed, appSchema as TranslationsSchemaRoot)
    } catch (error) {
      this.addError('Transforming seed', error instanceof Error ? error : String(error))
      return
    }

    const todos = collectSeedTodos(seed)
    for (const todo of todos) {
      this.addWarning(todo)
    }

    await this.writeGlobal(slug, data, DEFAULT_LOCALE)
  }

  // --- wm-web-translations: real English copy from data.en.json ---

  private async seedWmWeb(): Promise<void> {
    const { loadJsonData } = await import('../lib/dataLoader')
    const seed = await loadJsonData<WmWebSeedFile>({
      localPath: WM_WEB_SEED_LOCAL_PATH,
      inlineContent: this.options.inlineData?.[WM_WEB_SEED_LOCAL_PATH],
    })

    const { _meta: _ignored, ...data } = seed
    await this.writeGlobal('wm-web-translations', data, DEFAULT_LOCALE, true)
  }

  // --- sy-atlas-translations: the widget's own copy, ten locales, each published ---

  private async seedAtlas(): Promise<void> {
    const slug = 'sy-atlas-translations'

    await this.seedLocaleFiles({
      slug,
      locales: ATLAS_LOCALES,
      dataFile: atlasTranslationsDataFile,
      // English alone carries the two live groups, and only to fill a key that
      // is blank today. A translated value already in the CMS always wins, and
      // no other locale sends these groups at all.
      //
      // A read that FAILED is not a read that came back empty. Filling from
      // defaults on a failure would write English over an editor's own copy,
      // wholesale — so a failed read omits both groups instead, exactly as
      // every other locale does.
      prepare: async (data, locale) => {
        if (locale !== DEFAULT_LOCALE) return

        const stored = await this.readAtlasGlobal(slug, locale)
        if (!stored.ok) return

        const emails = fillBlanks(stored.doc?.emails, EMAILS_GROUP_DEFAULTS)
        if (emails) data.emails = emails

        const storedEvent = asRecord(stored.doc?.event)
        const title = fillBlanks(storedEvent?.title, EVENT_TITLE_DEFAULTS)
        if (title) {
          data.event = { ...(asRecord(data.event) ?? {}), title }
        }
      },
    })
  }

  /**
   * Reads the stored atlas global for one locale, with no English fallback.
   *
   * `ok` distinguishes "there was nothing there" from "we could not look".
   * Only the caller can decide what the second means, and here it means: touch
   * nothing.
   */
  private async readAtlasGlobal(
    slug: string,
    locale: AtlasLocale,
  ): Promise<{ ok: true; doc: Record<string, unknown> | undefined } | { ok: false }> {
    // A dry run writes nothing, so there is nothing to preserve.
    if (this.options.dryRun || !this.payload) return { ok: false }

    try {
      const stored = await this.payload.findGlobal({
        slug: slug as Parameters<typeof this.payload.findGlobal>[0]['slug'],
        locale,
        fallbackLocale: false,
        depth: 0,
      })
      return { ok: true, doc: asRecord(stored) }
    } catch (error) {
      // A global that has never been written reads as empty rather than
      // failing, so this only fires on a real database problem.
      this.addWarning(
        `Could not read ${slug} (locale=${locale}); leaving its emails and event.title alone: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return { ok: false }
    }
  }

  // --- The per-locale loop and the publishing write ---

  /**
   * Seeds one `data.<locale>.json` per locale and publishes that locale alone.
   *
   * Per-locale publish is what makes a language selectable in the matching
   * config global's `availableLocales`, whose validator rejects a locale whose
   * translations are not published (#705). `publishSpecificLocale` takes
   * Payload's single-locale branch, merging the incoming locale over the stored
   * global and marking only that locale published. `publishAllLocales` cannot
   * be used here: it scopes itself through `filterAvailableLocales`, which
   * answers `['en']` for a request with no user — every seed request.
   *
   * `prepare` runs after `_meta` is stripped, for a caller that has to add or
   * hold back a group before the write.
   */
  protected async seedLocaleFiles<L extends LocaleCode>({
    slug,
    locales,
    dataFile,
    prepare,
  }: {
    slug: string
    locales: readonly L[]
    dataFile: (locale: L) => string
    prepare?: (data: Record<string, unknown>, locale: L) => Promise<void>
  }): Promise<void> {
    const { loadJsonData } = await import('../lib/dataLoader')

    for (const locale of locales) {
      const localPath = dataFile(locale)

      let seed: LocaleSeedFile
      try {
        seed = await loadJsonData<LocaleSeedFile>({
          localPath,
          inlineContent: this.options.inlineData?.[localPath],
        })
      } catch (error) {
        this.addError(`Loading ${localPath}`, error instanceof Error ? error : String(error))
        continue
      }

      // A file in the wrong slot would publish one language's words as
      // another's. The header is the only thing that says which it is.
      if (seed._meta?.locale !== locale) {
        this.addError(
          `Loading ${localPath}`,
          `_meta.locale is ${JSON.stringify(seed._meta?.locale)}, expected "${locale}"`,
        )
        continue
      }

      const { _meta: _ignored, ...data } = seed
      await prepare?.(data, locale)

      try {
        await this.writeGlobal(slug, data, locale, true)
      } catch (error) {
        // `writeGlobal` reports an `updateGlobal` failure, and the remaining
        // locales are independent writes. A missing Payload instance is
        // neither: it fails every locale, and nothing reported it.
        if (!this.payload && !this.options.dryRun) throw error
        continue
      }
    }
  }

  /**
   * `publish` publishes the one locale being written, and nothing else.
   *
   * Under `localizeStatus` (#705) `_status` is itself a localized column, so
   * writing `'published'` at `locale` fills only that locale's cell. Every
   * other locale stays a draft, which is what `availableLocales` reads to
   * refuse an untranslated language.
   *
   * Only a global whose `_status` is localized may be published here. On one
   * with a single `_status`, this would mark every locale published at once.
   * `tests/int/wm-web-translations-seed.int.spec.ts` holds that line by
   * asserting `wm-app-translations` comes back unpublished.
   */
  protected async writeGlobal(
    slug: string,
    seeded: Record<string, unknown>,
    locale: LocaleCode,
    publish = false,
  ): Promise<void> {
    // A key whose English lives in `translationsSchema.json` as `default` is
    // written from there, so the corpus files carry only the keys that predate
    // that convention (`src/lib/translations/englishDefaults.ts`). Every other
    // locale is left alone: a default written into `fr` would be a translation
    // nobody made.
    const schema = TRANSLATIONS_TARGETS.find((target) => target.slug === slug)?.schema
    const data = locale === DEFAULT_LOCALE && schema ? withEnglishDefaults(seeded, schema) : seeded
    const fieldNames = Object.keys(data)

    if (this.options.dryRun) {
      await this.logger.info(
        `[dry-run] Would write ${fieldNames.length} field(s) to global "${slug}" (locale=${locale})${
          publish ? `, publishing ${locale}` : ''
        }`,
      )
      for (const name of fieldNames) {
        this.report.incrementCreated()
        await this.reportDocument(slug, `${locale}:${name}`, 'created', {
          current: fieldNames.indexOf(name) + 1,
          total: fieldNames.length,
        })
      }
      return
    }

    if (!this.payload) {
      throw new Error('Payload instance not initialised (BaseImporter contract violation)')
    }

    try {
      await this.payload.updateGlobal({
        slug: slug as Parameters<typeof this.payload.updateGlobal>[0]['slug'],
        // `publishSpecificLocale` alone selects the single-locale branch but
        // does not decide the status — the incoming `_status` does. Without
        // this the write lands and the locale stays `draft`, which is exactly
        // the state `availableLocales` refuses.
        data: {
          ...data,
          ...(publish ? { _status: 'published' } : {}),
        } as Parameters<typeof this.payload.updateGlobal>[0]['data'],
        locale,
        ...(publish ? { draft: false, publishSpecificLocale: locale } : {}),
      })
      await this.logger.success(
        `Updated global "${slug}" with ${fieldNames.length} field(s) (locale=${locale})${
          publish ? ' — published' : ''
        }`,
      )
      for (const name of fieldNames) {
        this.report.incrementUpdated()
        await this.reportDocument(slug, `${locale}:${name}`, 'updated', {
          current: fieldNames.indexOf(name) + 1,
          total: fieldNames.length,
        })
      }
    } catch (error) {
      this.addError(
        `updateGlobal ${slug} locale=${locale}`,
        error instanceof Error ? error : String(error),
      )
      throw error
    }
  }
}

export default TranslationsImporter
