/**
 * wm-web-locales Seed — the nine non-English locales of `wm-web-translations`
 *
 * Writes `seeds/wm-web-translations/data.<locale>.json` for each locale in
 * `WM_WEB_TRANSLATION_LOCALES` and publishes that one locale, leaving English
 * and every other locale alone.
 *
 * It exists apart from `translations` on purpose. `translations` also rewrites
 * the English copy of `wm-app-translations` and every locale of
 * `sy-atlas-translations`, which are live content editors may have changed
 * since; an operator who only wants the website's languages loaded should not
 * have to accept that. This script touches `wm-web-translations` and nothing
 * else, and only the locales it names.
 *
 * Publishing a locale here is NOT what offers it on the site. That is
 * `wm-web-config.availableLocales`, which refuses a locale whose translations
 * are unpublished (`availableLocalesField.ts`) — so this run is the step that
 * has to come first.
 *
 * Idempotent — re-running overwrites the seeded locales' values with the
 * files' values. A key edited in the admin since is overwritten too, so do
 * not re-run it once editors own the wording.
 *
 * Usage:
 *   pnpm seed wm-web-locales --dry-run
 *   pnpm seed wm-web-locales
 */

import * as path from 'path'

import { WM_WEB_TRANSLATION_LOCALES, wmWebTranslationsDataFile } from '../lib/dataFiles'
import { TranslationsImporter } from '../translations/import'

/** A locale seed file: the global's own data shape, plus a `_meta` header the writer strips. */
type WmWebLocaleFile = { _meta?: { locale?: unknown } } & Record<string, unknown>

export class WmWebLocalesImporter extends TranslationsImporter {
  protected override readonly importName = 'WM Web Translations (nine locales)'
  protected override readonly cacheDir = path.resolve(process.cwd(), 'seeds/cache/wm-web-locales')

  protected override async import(): Promise<void> {
    const { loadJsonData } = await import('../lib/dataLoader')

    for (const locale of WM_WEB_TRANSLATION_LOCALES) {
      const localPath = wmWebTranslationsDataFile(locale)

      let seed: WmWebLocaleFile
      try {
        seed = await loadJsonData<WmWebLocaleFile>({
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

      // One locale failing (already reported by `writeGlobal`) must not stop
      // the rest: each is its own write and its own publish.
      try {
        await this.writeGlobal('wm-web-translations', data, locale, true)
      } catch {
        continue
      }
    }
  }
}

export default WmWebLocalesImporter
