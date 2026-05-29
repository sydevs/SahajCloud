/**
 * wm-app-translations Import Script
 *
 * Seeds the `wm-app-translations` PayloadCMS global with English source copy
 * from `seeds/wm-app-translations/data.en.json`. The seed data covers all
 * 40 leaf groups (33 pure-string + 7 mixed-with-richText). Sources documented
 * inline in the JSON's `_meta` block — see issue #393 for the full rationale.
 *
 * Idempotent — re-running overwrites the English locale value for every key
 * in the seed. Other locales are untouched.
 *
 * Usage:
 *   pnpm seed wm-app-translations --dry-run
 *   pnpm seed wm-app-translations
 *   SAHAJCLOUD_URL=https://cloud.sydevelopers.com pnpm seed wm-app-translations
 */

import * as path from 'path'

import { BaseImporter, type BaseImportOptions } from '../lib'

import {
  buildWmAppGlobalData,
  collectSeedTodos,
  type SeedFile,
  type TranslationsSchemaRoot,
} from './lexicalConverter'

import appSchema from '../../src/globals/wemeditate-app/translationsSchema.json' with { type: 'json' }

// ============================================================================
// Constants
// ============================================================================

const SEED_DATA_LOCAL_PATH = 'seeds/wm-app-translations/data.en.json'
const SEED_DATA_WORKER_URL =
  'https://raw.githubusercontent.com/sydevs/SahajCloud/main/seeds/wm-app-translations/data.en.json'

const GLOBAL_SLUG = 'wm-app-translations'
const LOCALE = 'en' as const

// ============================================================================
// Importer
// ============================================================================

export class WeMeditateAppTranslationsImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'WeMeditate App Translations (English seed)'
  protected readonly cacheDir = path.resolve(process.cwd(), 'seeds/cache/wm-app-translations')

  protected async import(): Promise<void> {
    // 1. Load seed data (works in both local dev and Workers).
    const { loadJsonData } = await import('../lib/dataLoader')
    const seed = await loadJsonData<SeedFile>({
      localPath: SEED_DATA_LOCAL_PATH,
      workerUrl: SEED_DATA_WORKER_URL,
      inlineContent: this.options.inlineData?.[SEED_DATA_LOCAL_PATH],
    })

    // 2. Build the nested write payload, driven by the schema so the shape
    //    matches buildTranslationTabs(): nested tabs are wrapped in a Payload
    //    group (data.onboarding.welcome), simple tabs stay flat (data.navigation).
    let data: Record<string, unknown>
    try {
      data = buildWmAppGlobalData(seed, appSchema as TranslationsSchemaRoot)
    } catch (error) {
      this.addError('Transforming seed', error instanceof Error ? error : String(error))
      return
    }

    const fieldNames = Object.keys(data)
    await this.logger.info(`Planned writes: ${fieldNames.length} global field(s)`)

    // 3. Surface every `_todo` marker so editors know what to finalise in
    //    the admin UI after the import lands.
    const todos = collectSeedTodos(seed)
    if (todos.length > 0) {
      await this.logger.warn(
        `${todos.length} TODO marker(s) — editor should finalise in the admin UI:`,
      )
      for (const todo of todos) {
        await this.logger.warn(`  - ${todo}`)
      }
      todos.forEach((todo) => this.addWarning(todo))
    }

    // 4. Dry-run path: report and stop.
    if (this.options.dryRun) {
      await this.logger.info('Dry-run — no write to the global was sent.')
      let current = 0
      for (const name of fieldNames) {
        this.report.incrementCreated()
        current += 1
        await this.reportDocument(GLOBAL_SLUG, name, 'created', {
          current,
          total: fieldNames.length,
        })
      }
      return
    }

    // 5. Commit path: single updateGlobal call writes all fields at once.
    if (!this.payload) {
      throw new Error('Payload instance not initialised (BaseImporter contract violation)')
    }
    try {
      await this.payload.updateGlobal({
        slug: GLOBAL_SLUG,
        data: data as Parameters<typeof this.payload.updateGlobal>[0]['data'],
        locale: LOCALE,
      })
      await this.logger.success(`Updated global "${GLOBAL_SLUG}" (locale=${LOCALE})`)
      let current = 0
      for (const name of fieldNames) {
        this.report.incrementUpdated()
        current += 1
        await this.reportDocument(GLOBAL_SLUG, name, 'updated', {
          current,
          total: fieldNames.length,
        })
      }
    } catch (error) {
      this.addError(
        `updateGlobal ${GLOBAL_SLUG} locale=${LOCALE}`,
        error instanceof Error ? error : String(error),
      )
      throw error
    }
  }
}

export default WeMeditateAppTranslationsImporter
