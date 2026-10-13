/**
 * Pins every translations seed's `_meta.schema_version` to the schema it seeds.
 *
 * The line is hand-written, and the importer strips `_meta` before the write,
 * so nothing downstream can contradict it. #739 added the atlas `seo` group and
 * left `11 tabs, 33 leaf groups` in all ten locale files; #830 edited that same
 * line without noticing. A reader taking the numbers on trust is the only
 * consumer the field has ever had, which is what makes it worth deriving.
 *
 * The three globals word the claim differently, so the parse and the walk live
 * in `tests/utils/translationsSchemaShape.ts` rather than once per seed.
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

function readSchemaVersion(seed: string): unknown {
  const file = path.resolve(process.cwd(), seed)
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { _meta?: { schema_version?: unknown } }
  return parsed._meta?.schema_version
}

/**
 * `quotesKeyCount` is each seed's own wording, not a preference: only wm-web
 * states a declared-key count, and only it is held to one.
 */
const SEEDS: Array<{ seed: string; schema: SchemaRoot; quotesKeyCount: boolean }> = [
  {
    seed: 'seeds/wm-web-translations/data.en.json',
    schema: webSchema as unknown as SchemaRoot,
    quotesKeyCount: true,
  },
  {
    seed: 'seeds/wm-app-translations/data.en.json',
    schema: appSchema as unknown as SchemaRoot,
    quotesKeyCount: false,
  },
  ...ATLAS_LOCALES.map((locale) => ({
    seed: `seeds/sy-atlas-translations/data.${locale}.json`,
    schema: atlasSchema as unknown as SchemaRoot,
    quotesKeyCount: false,
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
