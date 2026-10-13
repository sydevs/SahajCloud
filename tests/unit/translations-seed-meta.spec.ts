/**
 * Pins every translations seed's `_meta.schema_version` to the schema it seeds.
 *
 * `tests/utils/translationsSchemaShape.ts` owns the walk, the parse, and why
 * either is needed. This file owns only which seeds are held to it.
 *
 * Unit lane: pure JSON in, no Payload bootstrap.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import atlasSchema from '@/globals/SahajAtlasTranslations/translationsSchema.json' with { type: 'json' }
import appSchema from '@/globals/WeMeditateAppTranslations/translationsSchema.json' with { type: 'json' }
import webSchema from '@/globals/WeMeditateWebTranslations/translationsSchema.json' with { type: 'json' }

import { expectQuotedShape, schemaShape, type SchemaRoot } from '../utils/translationsSchemaShape'

const ATLAS_LOCALES = ['cs', 'de', 'en', 'es', 'fr', 'hu', 'nl', 'pt-BR', 'ru', 'uk'] as const

/** A JSON import widens `"object"` to `string`, so every schema needs this. */
const asRoot = (schema: unknown): SchemaRoot => schema as SchemaRoot

function readSchemaVersion(seed: string): unknown {
  const file = path.resolve(process.cwd(), seed)
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { _meta?: { schema_version?: unknown } }
  return parsed._meta?.schema_version
}

const SEEDS: Array<{ seed: string; schema: SchemaRoot; quotesKeyCount?: boolean }> = [
  { seed: 'seeds/wm-web-translations/data.en.json', schema: asRoot(webSchema), quotesKeyCount: true },
  { seed: 'seeds/wm-app-translations/data.en.json', schema: asRoot(appSchema) },
  ...ATLAS_LOCALES.map((locale) => ({
    seed: `seeds/sy-atlas-translations/data.${locale}.json`,
    schema: asRoot(atlasSchema),
  })),
]

describe('translations seeds · _meta.schema_version', () => {
  // Every comparison below is against derived numbers, so a walk that found
  // nothing would make a seed quoting zeroes correct. `schemaShape` refuses
  // that case rather than answering it.
  it('refuses to derive a shape from a schema with no tabs', () => {
    expect(() => schemaShape({ properties: {} })).toThrow(/no tabs/)
  })

  it.each(SEEDS)('$seed quotes its own schema shape', ({ seed, schema, quotesKeyCount }) => {
    expectQuotedShape({
      seed,
      schemaVersion: readSchemaVersion(seed),
      schema,
      quotesKeyCount,
    })
  })
})
