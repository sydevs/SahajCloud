/**
 * Translations Seed — all three translation globals
 *
 * Seeds every translation global:
 *   wm-app-translations   → real copy from seeds/wm-app-translations/data.en.json
 *   wm-web-translations   → example strings derived from the schema key names
 *   sy-atlas-translations → the widget's own shipped copy, in all ten locales,
 *                           each published individually
 *
 * Idempotent — re-running overwrites the seeded locales' values. For the atlas
 * global the two groups holding live production data (`emails` and
 * `event.title`) are never overwritten: no seed file carries them, and English
 * defaults fill only a key that is currently blank.
 *
 * Usage:
 *   pnpm seed:dev translations --dry-run
 *   pnpm seed:dev translations
 */

import type { LocaleCode } from '../../src/lib/locales'

import * as path from 'path'

import appSchema from '../../src/globals/WeMeditateAppTranslations/translationsSchema.json' with { type: 'json' }
import wmWebSchema from '../../src/globals/WeMeditateWebTranslations/translationsSchema.json' with { type: 'json' }
import { EVENT_TITLE_DEFAULTS } from '../../src/lib/eventTitle/compose'
import { EMAIL_STRING_DEFAULTS } from '../../src/lib/translations/emailStrings'
import { BaseImporter, type BaseImportOptions } from '../lib'
import {
  buildWmAppGlobalData,
  collectSeedTodos,
  type SeedFile,
  type TranslationsSchemaRoot,
} from '../wm-app-translations/lexicalConverter'

// ============================================================================
// Example-data generator (for wm-web and sy-atlas)
// ============================================================================

type LeafProp = { type: 'string' | 'richText' }
type GroupNode = { type: 'object'; properties?: Record<string, LeafProp | GroupNode> }
type SchemaRoot = { type: 'object'; properties?: Record<string, GroupNode> }

function isGroup(n: LeafProp | GroupNode): n is GroupNode {
  return n.type === 'object'
}

function toLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function makeLexical(text: string) {
  return {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: [
        {
          type: 'paragraph',
          version: 1,
          format: '',
          indent: 0,
          direction: null,
          textFormat: 0,
          children: [
            { type: 'text', version: 1, format: 0, text, detail: 0, mode: 'normal', style: '' },
          ],
        },
      ],
    },
  }
}

function generateExampleData(schema: SchemaRoot): Record<string, unknown> {
  const data: Record<string, unknown> = {}

  function walkNode(node: GroupNode, segments: string[]): void {
    const props = node.properties ?? {}
    const leafSlug = segments.join('_')
    const stringKeys: Record<string, string> = {}

    for (const [key, child] of Object.entries(props)) {
      if (isGroup(child)) {
        walkNode(child, [...segments, key])
      } else if (child.type === 'string') {
        stringKeys[key] = toLabel(key)
      } else if (child.type === 'richText') {
        data[`${leafSlug}_${key}`] = makeLexical(toLabel(key))
      }
    }

    if (Object.keys(stringKeys).length > 0) {
      data[leafSlug] = stringKeys
    }
  }

  for (const [tabKey, tabNode] of Object.entries(schema.properties ?? {})) {
    walkNode(tabNode, [tabKey])
  }

  return data
}

// ============================================================================
// Preserving the two groups that hold live data
// ============================================================================

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

// ============================================================================
// Seed definitions
// ============================================================================

const SEED_DATA_LOCAL_PATH = 'seeds/wm-app-translations/data.en.json'

const DEFAULT_LOCALE: LocaleCode = 'en'

/**
 * The ten locales the Sahaj Atlas widget ships translations for, and the ten
 * an operator selects in `sy-atlas-config.availableLocales` after this seed
 * runs. One file per locale under `seeds/sy-atlas-translations/`.
 */
const ATLAS_LOCALES = [
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

type AtlasLocale = (typeof ATLAS_LOCALES)[number]

/**
 * Shape of a `seeds/sy-atlas-translations/data.<locale>.json` file: the
 * global's own data shape, plus a `_meta` header the writer strips.
 */
type AtlasSeedFile = Record<string, unknown> & { _meta?: unknown }

// ============================================================================
// Importer
// ============================================================================

export class TranslationsImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'Translations (all three globals; the atlas in ten locales)'
  protected readonly cacheDir = path.resolve(process.cwd(), 'seeds/cache/translations')

  protected async import(): Promise<void> {
    await this.seedWmApp()
    await this.seedFromSchema('wm-web-translations', wmWebSchema as SchemaRoot)
    await this.seedAtlas()
  }

  // --------------------------------------------------------------------------
  // wm-app-translations: real English copy from data.en.json
  // --------------------------------------------------------------------------

  private async seedWmApp(): Promise<void> {
    const slug = 'wm-app-translations'

    const { loadJsonData } = await import('../lib/dataLoader')
    const seed = await loadJsonData<SeedFile>({
      localPath: SEED_DATA_LOCAL_PATH,
      inlineContent: this.options.inlineData?.[SEED_DATA_LOCAL_PATH],
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

  // --------------------------------------------------------------------------
  // wm-web-translations: generated example content
  // --------------------------------------------------------------------------

  private async seedFromSchema(slug: string, schema: SchemaRoot): Promise<void> {
    const data = generateExampleData(schema)
    await this.writeGlobal(slug, data, DEFAULT_LOCALE)
  }

  // --------------------------------------------------------------------------
  // sy-atlas-translations: the widget's own copy, ten locales, each published
  // --------------------------------------------------------------------------

  /**
   * Seeds one file per locale and publishes that locale on its own.
   *
   * Per-locale publish is what makes the ten selectable in
   * `sy-atlas-config.availableLocales`, whose validator rejects a locale whose
   * translations are not published (#705). `publishSpecificLocale` takes
   * Payload's single-locale branch, merging the incoming locale over the stored
   * global and marking only that locale published. `publishAllLocales` cannot
   * be used here: it scopes itself through `filterAvailableLocales`, which
   * answers `['en']` for a request with no user — every seed request.
   */
  private async seedAtlas(): Promise<void> {
    const slug = 'sy-atlas-translations'
    const { loadJsonData } = await import('../lib/dataLoader')

    for (const locale of ATLAS_LOCALES) {
      const localPath = `seeds/sy-atlas-translations/data.${locale}.json`

      let seed: AtlasSeedFile
      try {
        seed = await loadJsonData<AtlasSeedFile>({
          localPath,
          inlineContent: this.options.inlineData?.[localPath],
        })
      } catch (error) {
        this.addError(`Loading ${localPath}`, error instanceof Error ? error : String(error))
        continue
      }

      const { _meta: _ignored, ...data } = seed

      // English alone carries the two live groups, and only to fill a key that
      // is blank today. A translated value already in the CMS always wins, and
      // no other locale sends these groups at all.
      //
      // A read that FAILED is not a read that came back empty. Filling from
      // defaults on a failure would write English over an editor's own copy,
      // wholesale — so a failed read omits both groups instead, exactly as
      // every other locale does.
      if (locale === DEFAULT_LOCALE) {
        const stored = await this.readAtlasGlobal(slug, locale)

        if (stored.ok) {
          const emails = fillBlanks(stored.doc?.emails, EMAIL_STRING_DEFAULTS)
          if (emails) data.emails = emails

          const storedEvent = asRecord(stored.doc?.event)
          const title = fillBlanks(storedEvent?.title, EVENT_TITLE_DEFAULTS)
          if (title) {
            data.event = { ...(asRecord(data.event) ?? {}), title }
          }
        }
      }

      await this.writeGlobal(slug, data, locale, true)
    }
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

  // --------------------------------------------------------------------------
  // Shared write helper
  // --------------------------------------------------------------------------

  private async writeGlobal(
    slug: string,
    data: Record<string, unknown>,
    locale: LocaleCode,
    publish = false,
  ): Promise<void> {
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
