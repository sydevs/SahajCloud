/**
 * Walks a `translationsSchema.json` and answers where each leaf key's value
 * lives on a loaded global.
 *
 * Shared by the WeMeditate App status report (which asks "is this key
 * populated for this locale?") and `clientEnglishFallback` (which asks "which
 * keys must I fill from English?"). Both need the same schema-to-data-path
 * mapping, and a second copy of it would drift the moment the field builder's
 * nesting rules change.
 */

import { pluralStorageKeys } from './pluralCategories'

export type LeafProp = { type: 'string' | 'richText'; plural?: boolean }

export type SchemaNode = {
  type: 'object'
  description?: string
  properties?: Record<string, LeafProp | SchemaNode>
}

/**
 * Per-leaf-key descriptor for looking up the live value on a loaded global.
 *
 * For nested tabs (sub-groups wrapped in a Payload group), `groupField` is the
 * group name (e.g. `onboarding`) and `fieldName` is the sub-slug (e.g.
 * `welcome`). String keys live at `data[groupField][fieldName][key]`. RichText
 * keys live at `data[groupField][fieldName_key]`.
 *
 * For simple tabs (no sub-groups), `groupField` is null. String keys live at
 * `data[fieldName][key]`. RichText keys live at `data[fieldName_key]`.
 */
export interface LeafLookup {
  groupField: string | null
  fieldName: string
  innerKey: string | null
}

export interface CollectOptions {
  /**
   * Expand a `plural: true` key into its CLDR storage family.
   *
   * Off for the status report, which asks about one declared key. On for the
   * English merge, which fills the keys that are actually stored.
   */
  expandPlurals?: boolean
}

export function isObjectNode(node: LeafProp | SchemaNode): node is SchemaNode {
  return node.type === 'object'
}

function stringLookups(
  groupField: string | null,
  fieldName: string,
  key: string,
  prop: LeafProp,
  expandPlurals: boolean,
): LeafLookup[] {
  const keys = expandPlurals && prop.plural === true ? pluralStorageKeys(key) : [key]
  return keys.map((innerKey) => ({ groupField, fieldName, innerKey }))
}

export function collectLeafLookups(
  tabSlug: string,
  tabNode: SchemaNode,
  { expandPlurals = false }: CollectOptions = {},
): LeafLookup[] {
  const out: LeafLookup[] = []
  const topLevelProps = tabNode.properties ?? {}
  const hasSubgroups = Object.values(topLevelProps).some(isObjectNode)

  if (!hasSubgroups) {
    // Simple tab: one JSON field named tabSlug containing all string keys.
    for (const [key, child] of Object.entries(topLevelProps)) {
      if (isObjectNode(child)) continue
      if (child.type === 'string') {
        out.push(...stringLookups(null, tabSlug, key, child, expandPlurals))
      } else if (child.type === 'richText') {
        out.push({ groupField: null, fieldName: `${tabSlug}_${key}`, innerKey: null })
      }
    }
    return out
  }

  // Nested tab: each sub-group is a field under a Payload group named tabSlug.
  // API path: data[tabSlug][subSlug][key]
  for (const [subSlug, subSchema] of Object.entries(topLevelProps)) {
    if (!isObjectNode(subSchema)) continue
    for (const [key, child] of Object.entries(subSchema.properties ?? {})) {
      if (isObjectNode(child)) continue
      if (child.type === 'string') {
        out.push(...stringLookups(tabSlug, subSlug, key, child, expandPlurals))
      } else if (child.type === 'richText') {
        out.push({ groupField: tabSlug, fieldName: `${subSlug}_${key}`, innerKey: null })
      }
    }
  }
  return out
}

/** Flatten a Lexical richText value (or a plain string) to its text content. */
export function extractPlainText(node: unknown): string {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(extractPlainText).join('')
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (typeof obj.text === 'string') return obj.text
    if (Array.isArray(obj.children)) return extractPlainText(obj.children)
    if (obj.root) return extractPlainText(obj.root)
  }
  return ''
}
