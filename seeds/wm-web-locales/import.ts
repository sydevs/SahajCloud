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

import { TranslationGlobalsImporter } from '../lib'
import { WM_WEB_TRANSLATION_LOCALES, wmWebTranslationsDataFile } from '../lib/dataFiles'

export class WmWebLocalesImporter extends TranslationGlobalsImporter {
  protected readonly importName = 'WM Web Translations (nine locales)'
  protected readonly cacheDir = path.resolve(process.cwd(), 'seeds/cache/wm-web-locales')

  protected async import(): Promise<void> {
    await this.seedLocaleFiles({
      slug: 'wm-web-translations',
      locales: WM_WEB_TRANSLATION_LOCALES,
      dataFile: wmWebTranslationsDataFile,
    })
  }
}

export default WmWebLocalesImporter
