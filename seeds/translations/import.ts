/**
 * Translations Seed — all three translation globals
 *
 * Seeds every translation global with English content:
 *   wm-app-translations  → real copy from seeds/wm-app-translations/data.en.json
 *   wm-web-translations  → example strings derived from the schema key names
 *   sy-atlas-translations → example strings derived from the schema key names
 *
 * Idempotent — re-running overwrites the English locale value for every
 * field. Other locales are untouched.
 *
 * Usage:
 *   pnpm seed:dev translations --dry-run
 *   pnpm seed:dev translations
 */

import * as path from 'path'

import { BaseImporter, type BaseImportOptions } from '../lib'
import {
  buildWmAppGlobalData,
  collectSeedTodos,
  type SeedFile,
  type TranslationsSchemaRoot,
} from '../wm-app-translations/lexicalConverter'

import appSchema from '../../src/globals/wemeditate-app/translationsSchema.json' with { type: 'json' }
import atlasSchema from '../../src/globals/sahaj-atlas/translationsSchema.json' with { type: 'json' }
import wmWebSchema from '../../src/globals/wemeditate-web/translationsSchema.json' with { type: 'json' }

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
// Seed definitions
// ============================================================================

const SEED_DATA_LOCAL_PATH = 'seeds/wm-app-translations/data.en.json'
const SEED_DATA_WORKER_URL =
  'https://raw.githubusercontent.com/sydevs/SahajCloud/main/seeds/wm-app-translations/data.en.json'

const LOCALE = 'en' as const

// ============================================================================
// Importer
// ============================================================================

export class TranslationsImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'Translations (English seed — all three globals)'
  protected readonly cacheDir = path.resolve(process.cwd(), 'seeds/cache/translations')

  protected async import(): Promise<void> {
    await this.seedWmApp()
    await this.seedFromSchema('wm-web-translations', wmWebSchema as SchemaRoot)
    await this.seedFromSchema('sy-atlas-translations', atlasSchema as SchemaRoot)
  }

  // --------------------------------------------------------------------------
  // wm-app-translations: real English copy from data.en.json
  // --------------------------------------------------------------------------

  private async seedWmApp(): Promise<void> {
    const slug = 'wm-app-translations'

    const { loadJsonData } = await import('../lib/dataLoader')
    const seed = await loadJsonData<SeedFile>({
      localPath: SEED_DATA_LOCAL_PATH,
      workerUrl: SEED_DATA_WORKER_URL,
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

    await this.writeGlobal(slug, data)
  }

  // --------------------------------------------------------------------------
  // wm-web-translations / sy-atlas-translations: generated example content
  // --------------------------------------------------------------------------

  private async seedFromSchema(slug: string, schema: SchemaRoot): Promise<void> {
    const data = generateExampleData(schema)
    await this.writeGlobal(slug, data)
  }

  // --------------------------------------------------------------------------
  // Shared write helper
  // --------------------------------------------------------------------------

  private async writeGlobal(slug: string, data: Record<string, unknown>): Promise<void> {
    const fieldNames = Object.keys(data)

    if (this.options.dryRun) {
      await this.logger.info(
        `[dry-run] Would write ${fieldNames.length} field(s) to global "${slug}"`,
      )
      for (const name of fieldNames) {
        this.report.incrementCreated()
        await this.reportDocument(slug, name, 'created', {
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
        data: data as Parameters<typeof this.payload.updateGlobal>[0]['data'],
        locale: LOCALE,
      })
      await this.logger.success(
        `Updated global "${slug}" with ${fieldNames.length} field(s) (locale=${LOCALE})`,
      )
      for (const name of fieldNames) {
        this.report.incrementUpdated()
        await this.reportDocument(slug, name, 'updated', {
          current: fieldNames.indexOf(name) + 1,
          total: fieldNames.length,
        })
      }
    } catch (error) {
      this.addError(
        `updateGlobal ${slug} locale=${LOCALE}`,
        error instanceof Error ? error : String(error),
      )
      throw error
    }
  }
}

export default TranslationsImporter
