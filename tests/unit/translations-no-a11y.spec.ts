/**
 * No translations global declares a screen-reader-only string.
 *
 * A string only a screen reader speaks lives in the site that renders it —
 * WeMeditate Web's `lib/i18n/a11y/`, Sahaj Atlas's `src/config/a11y/` —
 * machine-translated there, and read at `<tab>.a11y.<key>`. Neither site reads
 * one from here, so declared here it would cost every translator a row no site
 * renders, and a migration per key.
 */

import { describe, expect, it } from 'vitest'

import atlasSchema from '@/globals/SahajAtlasTranslations/translationsSchema.json'
import appSchema from '@/globals/WeMeditateAppTranslations/translationsSchema.json'
import webSchema from '@/globals/WeMeditateWebTranslations/translationsSchema.json'

interface Node {
  description?: string
  properties?: Record<string, Node>
}

/** Every property path in a schema, with its description. */
function walk(node: Node, prefix = ''): Array<{ path: string; description: string }> {
  return Object.entries(node.properties ?? {}).flatMap(([name, child]) => {
    const path = prefix ? `${prefix}.${name}` : name

    return [{ path, description: child.description ?? '' }, ...walk(child, path)]
  })
}

const SCHEMAS = [
  ['sy-atlas-translations', atlasSchema],
  ['wm-app-translations', appSchema],
  ['wm-web-translations', webSchema],
] as const

describe.each(SCHEMAS)('%s', (_slug, schema) => {
  const paths = walk(schema as Node)

  it('walks a schema with keys in it', () => {
    expect(paths.length).toBeGreaterThan(20)
  })

  it('declares no a11y group', () => {
    expect(paths.filter(({ path }) => path.split('.').includes('a11y'))).toEqual([])
  })

  it('declares no key it says only a screen reader reads', () => {
    expect(paths.filter(({ description }) => /^Not shown on screen/i.test(description))).toEqual([])
  })
})
