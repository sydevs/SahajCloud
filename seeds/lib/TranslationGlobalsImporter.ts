/**
 * Shared base for the importers that write a translation global.
 *
 * Two scripts run the same per-locale loop — `translations` for the atlas
 * global's ten locales, `wm-web-locales` for the website's nine — so the loop
 * and the write live here rather than in either of them. Neither script is the
 * other's parent: a subclass of one inherits seed methods it then has to
 * forbid.
 */
import type { LocaleCode } from '../../src/lib/locales'

import { BaseImporter, type BaseImportOptions } from './BaseImporter'

/**
 * A `data.<locale>.json` seed file: the global's own data shape, plus a `_meta`
 * header the writer strips.
 */
type LocaleSeedFile = { _meta?: { locale?: unknown } } & Record<string, unknown>

export abstract class TranslationGlobalsImporter<
  TOptions extends BaseImportOptions = BaseImportOptions,
> extends BaseImporter<TOptions> {
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
    const { loadJsonData } = await import('./dataLoader')

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
      } catch {
        // One locale failing (already reported by `writeGlobal`) must not stop
        // the rest: each is its own write and its own publish.
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
