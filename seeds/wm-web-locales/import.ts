/**
 * wm-web-locales Seed — the nine non-English locales of `wm-web-translations`
 *
 * It exists apart from `translations` on purpose. That script also rewrites the
 * English copy of `wm-app-translations` and every locale of
 * `sy-atlas-translations`, which are live content editors may have changed
 * since; an operator who only wants the website's languages loaded should not
 * have to accept that.
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
