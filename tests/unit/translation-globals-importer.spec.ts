/**
 * `seedLocaleFiles`, on the two failures that must not be mistaken for a
 * per-locale one (`seeds/lib/TranslationGlobalsImporter.ts`).
 *
 * The loop swallows a `writeGlobal` throw on purpose: each locale is its own
 * write and its own publish, and `writeGlobal` has already reported the
 * `updateGlobal` failure. The contract violation it raises when no Payload
 * instance was injected is the one throw it reports nowhere — swallowing that
 * one reports a clean run over nine locales nothing was written for.
 *
 * The `_meta.locale` check is the other: a file in the wrong slot would publish
 * one language's words as another's, so it must stop before the write and not
 * at it.
 *
 * Unit lane: no Payload bootstrap, which is what makes the first case reachable
 * at all.
 */

import type { BaseImportOptions } from '../../seeds/lib'

import * as path from 'path'

import { describe, expect, it, vi } from 'vitest'

import { type WmWebTranslationLocale, wmWebTranslationsDataFile } from '../../seeds/lib/dataFiles'
import { Logger } from '../../seeds/lib/logger'
import { TranslationGlobalsImporter } from '../../seeds/lib/TranslationGlobalsImporter'
import { ValidationReport } from '../../seeds/lib/validationReport'

/**
 * `run()` is what normally injects the logger and the report. This calls
 * `seedLocaleFiles` directly, so it supplies both and leaves `payload` unset —
 * the state the first case is about.
 */
class ProbeImporter extends TranslationGlobalsImporter {
  readonly log = new Logger()

  protected readonly importName = 'Probe'
  protected readonly cacheDir = path.resolve(process.cwd(), 'seeds/cache/probe')

  constructor(options: BaseImportOptions) {
    super(options)
    this.logger = this.log
    this.report = new ValidationReport()
  }

  seedOne(
    locale: WmWebTranslationLocale,
    dataFile: (locale: WmWebTranslationLocale) => string = wmWebTranslationsDataFile,
  ): Promise<void> {
    return this.seedLocaleFiles({ slug: 'wm-web-translations', locales: [locale], dataFile })
  }

  protected async import(): Promise<void> {}
}

describe('seedLocaleFiles', () => {
  it('re-throws the missing-Payload contract violation instead of reporting a clean run', async () => {
    const importer = new ProbeImporter({ dryRun: false, clearCache: false })

    await expect(importer.seedOne('ru')).rejects.toThrow(/Payload instance not initialised/)
  })

  it('refuses a file whose _meta.locale names another language, before any write', async () => {
    const importer = new ProbeImporter({ dryRun: false, clearCache: false })
    const logged = vi.spyOn(importer.log, 'error').mockResolvedValue(undefined)

    // Italian wording in Russian's slot: the header is the only thing that says
    // which language a file holds.
    await expect(
      importer.seedOne('ru', () => wmWebTranslationsDataFile('it')),
    ).resolves.toBeUndefined()

    expect(logged).toHaveBeenCalledWith(expect.stringContaining('_meta.locale is "it"'))
  })
})
