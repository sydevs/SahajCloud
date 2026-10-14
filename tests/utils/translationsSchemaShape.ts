/**
 * Derives a `translationsSchema.json`'s own shape, and checks the shape a
 * seed's `_meta.schema_version` claims against it.
 *
 * All three translations seeds hand-write that line and nothing consumes it —
 * the importer strips `_meta`. So #739 added the atlas `seo` group and left
 * `11 tabs, 33 leaf groups` standing in all ten locale files, surviving #830
 * editing that very line. Deriving the numbers is what makes the claim
 * answerable.
 *
 * The three seeds word the claim differently — `outer tabs`, a declared-key
 * count, trailing prose — so one copy of the parse here is what lets all three
 * share one assertion.
 */

import { expect } from 'vitest'

import {
  collectLeafLookups,
  isObjectNode,
  type LeafProp,
  type SchemaNode,
} from '@/lib/translations/schemaWalker'

export type SchemaRoot = { properties?: Record<string, LeafProp | SchemaNode> }

interface SchemaShape {
  tabs: number
  leafGroups: number
  /** Declared string keys, plural families collapsed to the one declared name. */
  keys: number
}

/** The shape a `_meta.schema_version` line claims, as written. */
interface QuotedShape {
  tabs: number
  leafGroups: number
  /** Null where the line quotes no key count — `wm-app` and `sy-atlas` do not. */
  keys: number | null
}

/**
 * A leaf group is a node whose children are all keys: one jsonb column. A tab
 * with no sub-groups is therefore its own leaf group.
 */
function leafGroups(node: SchemaNode): number {
  const groups = Object.values(node.properties ?? {}).filter(isObjectNode)
  return groups.length > 0 ? groups.reduce((total, child) => total + leafGroups(child), 0) : 1
}

/**
 * Counted through `collectLeafLookups`, the walker the English merge uses, so
 * this answer cannot disagree with the one production reaches. `innerKey` is
 * null for a richText leaf, which no seed's key count includes.
 */
function declaredKeys(tabSlug: string, tabNode: SchemaNode): number {
  return collectLeafLookups(tabSlug, tabNode).filter((lookup) => lookup.innerKey !== null).length
}

/**
 * The empty-slug clause is not defensive: `buildTranslationTabs` and
 * `schemaLookups` both skip such a tab, so counting it here would make the
 * derived number disagree with the field tree that actually ships.
 */
export function schemaShape(schema: SchemaRoot): SchemaShape {
  const tabs = Object.entries(schema.properties ?? {}).filter(
    (entry): entry is [string, SchemaNode] =>
      entry[0].trim().length > 0 && isObjectNode(entry[1]),
  )
  // A walker that found nothing would let a seed quoting zeroes pass.
  if (tabs.length === 0) throw new Error('schemaShape walked a schema with no tabs')
  return {
    tabs: tabs.length,
    leafGroups: tabs.reduce((total, [, node]) => total + leafGroups(node), 0),
    keys: tabs.reduce((total, [slug, node]) => total + declaredKeys(slug, node), 0),
  }
}

const QUOTED_SHAPE = /(\d+) (?:outer )?tabs, (\d+) leaf groups(?:, (\d+) declared keys)?/

function parseQuotedShape(schemaVersion: unknown): QuotedShape | null {
  const matched = typeof schemaVersion === 'string' ? QUOTED_SHAPE.exec(schemaVersion) : null
  if (matched === null) return null
  return {
    tabs: Number(matched[1]),
    leafGroups: Number(matched[2]),
    keys: matched[3] === undefined ? null : Number(matched[3]),
  }
}

interface SeedShapeClaim {
  /** Seed path, so a failure names which file is wrong. */
  seed: string
  schemaVersion: unknown
  schema: SchemaRoot
  /**
   * Only wm-web's wording carries one. Deliberately not the inverse: a seed
   * quoting no count may gain a correct one without this becoming a lie.
   */
  requiresKeyCount?: boolean
}

export function expectQuotedShape({
  seed,
  schemaVersion,
  schema,
  requiresKeyCount,
}: SeedShapeClaim): void {
  const quoted = parseQuotedShape(schemaVersion)
  if (quoted === null) {
    throw new Error(`${seed}: _meta.schema_version quotes no shape: ${String(schemaVersion)}`)
  }
  if (requiresKeyCount === true && quoted.keys === null) {
    throw new Error(`${seed}: _meta.schema_version dropped its declared-key count`)
  }
  const derived = schemaShape(schema)
  expect({ tabs: quoted.tabs, leafGroups: quoted.leafGroups }, seed).toEqual({
    tabs: derived.tabs,
    leafGroups: derived.leafGroups,
  })
  // Checked whenever it is present, required only above. A seed that starts
  // quoting a correct count must not need this spec edited to stay green.
  if (quoted.keys !== null) {
    expect(quoted.keys, `${seed}: declared keys`).toBe(derived.keys)
  }
}
