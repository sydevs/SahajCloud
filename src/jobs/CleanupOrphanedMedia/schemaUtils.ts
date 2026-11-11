/**
 * Schema Introspection Utilities
 *
 * Provides utilities for discovering field references in Payload CMS collections
 * by traversing the configuration schema at runtime.
 */

import type {
  ArrayField,
  Block,
  CollapsibleField,
  Field,
  GroupField,
  Payload,
  RelationshipField,
  RowField,
  TabsField,
  UploadField,
} from 'payload'

import { valueIsValueWithRelation } from 'payload/shared'

import { isRecord } from '@/lib/utilities/isRecord'

/** Represents a discovered field reference to a target collection */
export interface FieldReference {
  /** Source collection slug (e.g., 'lessons') */
  collection: string
  /** Path to field using dot notation, with * for array items (e.g., 'panels.*.media') */
  fieldPath: string
  /** Type of field: upload or relationship */
  fieldType: 'upload' | 'relationship'
  /** Whether the field allows multiple values */
  hasMany: boolean
  /** Target collection(s) this field references */
  relationTo: string | string[]
  /** Whether this is a Lexical block field (requires content extraction) */
  isLexicalBlock: boolean
  /** Block slug if this is a Lexical block field */
  blockSlug?: string
  /**
   * For a Lexical field: the references inside each block that point at the
   * target collection, keyed by the block's slug.
   */
  lexicalFields?: Map<string, FieldReference[]>
  /**
   * Indices into `fieldPath`'s segments whose value a `locale: 'all'` read
   * returns as a `{ [locale]: value }` map, read off each field's own
   * `localized` flag while walking the schema.
   */
  localizedAt: number[]
}

/** Append a named field's segment to the path walked so far. */
function joinPath(pathPrefix: string, segment: string): string {
  return pathPrefix ? `${pathPrefix}.${segment}` : segment
}

/** The index a named field's own value sits at, within the path walked so far. */
function segmentCount(pathPrefix: string): number {
  return pathPrefix ? pathPrefix.split('.').length : 0
}

/**
 * `localizedAt` plus this field's own segment when the field is localized.
 *
 * Payload deletes `localized` from a field nested inside a localized one
 * (`fields/config/sanitize.js`), so a path normally carries at most one.
 */
function recordLocalized(
  localizedAt: readonly number[],
  pathPrefix: string,
  localized: boolean | undefined,
): number[] {
  const recorded = [...localizedAt]
  if (localized) recorded.push(segmentCount(pathPrefix))
  return recorded
}

/** Check if a relationTo value includes the target collection */
function matchesTarget(relationTo: string | string[], targetCollection: string): boolean {
  if (Array.isArray(relationTo)) {
    return relationTo.includes(targetCollection)
  }
  return relationTo === targetCollection
}

/**
 * Traverse a field to find upload/relationship references to target collection.
 * Handles nested containers: tabs, groups, rows, arrays, blocks, collapsible.
 */
function traverseField(
  field: Field,
  targetCollection: string,
  pathPrefix: string,
  collectionSlug: string,
  references: FieldReference[],
  isLexicalBlock: boolean = false,
  blockSlug?: string,
  localizedAt: readonly number[] = [],
): void {
  switch (field.type) {
    case 'upload': {
      const uploadField = field as UploadField
      if (matchesTarget(uploadField.relationTo, targetCollection)) {
        references.push({
          collection: collectionSlug,
          fieldPath: joinPath(pathPrefix, uploadField.name),
          fieldType: 'upload',
          hasMany: uploadField.hasMany ?? false,
          relationTo: uploadField.relationTo,
          isLexicalBlock,
          blockSlug,
          localizedAt: recordLocalized(localizedAt, pathPrefix, uploadField.localized),
        })
      }
      break
    }

    case 'relationship': {
      const relationshipField = field as RelationshipField
      if (matchesTarget(relationshipField.relationTo, targetCollection)) {
        references.push({
          collection: collectionSlug,
          fieldPath: joinPath(pathPrefix, relationshipField.name),
          fieldType: 'relationship',
          hasMany: relationshipField.hasMany ?? false,
          relationTo: relationshipField.relationTo,
          isLexicalBlock,
          blockSlug,
          localizedAt: recordLocalized(localizedAt, pathPrefix, relationshipField.localized),
        })
      }
      break
    }

    case 'tabs': {
      const tabsField = field as TabsField
      for (const tab of tabsField.tabs) {
        // Named tabs add to path, unnamed tabs don't
        const isNamed = 'name' in tab && typeof tab.name === 'string'
        const tabPath = isNamed ? joinPath(pathPrefix, tab.name as string) : pathPrefix
        const tabLocalized = isNamed
          ? recordLocalized(localizedAt, pathPrefix, 'localized' in tab ? tab.localized : false)
          : localizedAt
        for (const tabField of tab.fields) {
          traverseField(
            tabField,
            targetCollection,
            tabPath,
            collectionSlug,
            references,
            isLexicalBlock,
            blockSlug,
            tabLocalized,
          )
        }
      }
      break
    }

    case 'group': {
      const groupField = field as GroupField
      // Named groups add to path, unnamed groups don't
      const hasName = 'name' in groupField && typeof groupField.name === 'string'
      const groupPath = hasName ? joinPath(pathPrefix, groupField.name) : pathPrefix
      const groupLocalized = hasName
        ? recordLocalized(localizedAt, pathPrefix, groupField.localized)
        : localizedAt
      for (const groupChildField of groupField.fields) {
        traverseField(
          groupChildField,
          targetCollection,
          groupPath,
          collectionSlug,
          references,
          isLexicalBlock,
          blockSlug,
          groupLocalized,
        )
      }
      break
    }

    case 'row': {
      const rowField = field as RowField
      // Row fields don't add to path - they're just layout
      for (const rowChildField of rowField.fields) {
        traverseField(
          rowChildField,
          targetCollection,
          pathPrefix,
          collectionSlug,
          references,
          isLexicalBlock,
          blockSlug,
          localizedAt,
        )
      }
      break
    }

    case 'array': {
      const arrayField = field as ArrayField
      const arrayPath = `${joinPath(pathPrefix, arrayField.name)}.*`
      // The locale map sits on the array itself, one segment above its items.
      const arrayLocalized = recordLocalized(localizedAt, pathPrefix, arrayField.localized)
      for (const arrayChildField of arrayField.fields) {
        traverseField(
          arrayChildField,
          targetCollection,
          arrayPath,
          collectionSlug,
          references,
          isLexicalBlock,
          blockSlug,
          arrayLocalized,
        )
      }
      break
    }

    case 'blocks': {
      // Note: This is for PayloadCMS blocks fields (not Lexical blocks)
      // Lexical blocks are handled separately via richText field
      const blocksField = field as { name: string; blocks: Block[]; localized?: boolean }
      const blocksPath = `${joinPath(pathPrefix, blocksField.name)}.*`
      const blocksLocalized = recordLocalized(localizedAt, pathPrefix, blocksField.localized)
      for (const block of blocksField.blocks) {
        const blockPath = `${blocksPath}.${block.slug}`
        for (const blockField of block.fields) {
          traverseField(
            blockField,
            targetCollection,
            blockPath,
            collectionSlug,
            references,
            isLexicalBlock,
            blockSlug,
            blocksLocalized,
          )
        }
      }
      break
    }

    case 'collapsible': {
      const collapsibleField = field as CollapsibleField
      // Collapsible fields don't add to path - they're just layout
      for (const collapsibleChildField of collapsibleField.fields) {
        traverseField(
          collapsibleChildField,
          targetCollection,
          pathPrefix,
          collectionSlug,
          references,
          isLexicalBlock,
          blockSlug,
          localizedAt,
        )
      }
      break
    }

    case 'richText': {
      // A Lexical field is one marker reference: its content is stored as a
      // node tree rather than at a field path, so the ids come out of the
      // content at scan time, through extractIdsFromLexicalContent().
      const richTextField = field as { name: string; editor?: unknown; localized?: boolean }
      if (richTextField.editor) {
        references.push({
          collection: collectionSlug,
          fieldPath: joinPath(pathPrefix, richTextField.name),
          fieldType: 'upload',
          hasMany: true,
          relationTo: targetCollection,
          isLexicalBlock: true,
          // No specific blockSlug - generic Lexical traversal
          localizedAt: recordLocalized(localizedAt, pathPrefix, richTextField.localized),
          lexicalFields: lexicalBlockReferences(
            richTextField.editor,
            targetCollection,
            collectionSlug,
          ),
        })
      }
      break
    }

    // Other field types don't contain references
    default:
      break
  }
}

/**
 * The block definitions a Lexical editor accepts, off its sanitized config.
 *
 * ⚠ The blocks feature holds the only copy. `payload.config.blocks` is the
 * registry for block *references*, which this editor does not use, and is
 * empty here.
 */
function lexicalBlocks(editor: unknown): Block[] {
  const features = (
    editor as { editorConfig?: { resolvedFeatureMap?: Map<string, unknown> } } | null
  )?.editorConfig?.resolvedFeatureMap
  const blocksFeature = features?.get('blocks') as
    { sanitizedServerFeatureProps?: { blocks?: Block[] } } | undefined
  // shortcut: an empty answer means a blockless editor and a shape Payload has
  // moved alike, and the second un-protects every block reference silently.
  // Re-check on a @payloadcms/richtext-lexical upgrade, and in the `dryRun`
  // review docs/architecture.md mandates before trusting a run.
  return blocksFeature?.sanitizedServerFeatureProps?.blocks ?? []
}

/**
 * Which references inside each of an editor's blocks point at the target
 * collection.
 *
 * ⚠ A block stores a bare id, so nothing in the content says which collection
 * that id belongs to — only the block's own schema does. Reading every id as a
 * reference made each one count for `files` and `images` alike, and the two
 * sequences overlap, so one collection's live document held the other's trash
 * back from the Phase A delete it was due (#1118).
 *
 * A block node's `fields` is shaped like a document of that block's own schema,
 * so these are ordinary references over it, read by `extractIdsFromDocument`.
 * They are not marked `isLexicalBlock` for that reason: the flag means "the ids
 * are in content somewhere", and here the path reaches them.
 */
function lexicalBlockReferences(
  editor: unknown,
  targetCollection: string,
  collectionSlug: string,
): Map<string, FieldReference[]> {
  const byBlock = new Map<string, FieldReference[]>()
  for (const block of lexicalBlocks(editor)) {
    const found: FieldReference[] = []
    for (const blockField of block.fields) {
      traverseField(blockField, targetCollection, '', collectionSlug, found)
    }
    if (found.length > 0) byBlock.set(block.slug, found)
  }
  return byBlock
}

/**
 * Discover all fields that reference a target collection across all collections.
 *
 * @param payload - The Payload instance
 * @param targetCollection - The collection slug to find references to (e.g., 'files' or 'images')
 * @returns Array of FieldReference objects describing each reference
 *
 * @example
 * const fileReferences = discoverReferencesForCollection(payload, 'files')
 * // Returns: [
 * //   { collection: 'lessons', fieldPath: 'introAudio', fieldType: 'upload', ... },
 * //   { collection: 'lessons', fieldPath: 'panels.*.media', fieldType: 'upload', ... },
 * // ]
 */
export function discoverReferencesForCollection(
  payload: Payload,
  targetCollection: string,
): FieldReference[] {
  const references: FieldReference[] = []

  // Iterate through all collections
  for (const [slug, collection] of Object.entries(payload.collections)) {
    // Skip the target collection itself (we're looking for references TO it)
    if (slug === targetCollection) continue

    // Skip Payload internal collections
    if (slug.startsWith('payload-')) continue

    const config = collection.config
    if (!config?.fields) continue

    // Traverse all fields in the collection
    for (const field of config.fields) {
      traverseField(field, targetCollection, '', slug, references)
    }
  }

  return references
}

/**
 * Check if a string contains only digits (fully numeric).
 * This is stricter than parseInt which would parse "123abc" as 123.
 */
function isNumericString(str: string): boolean {
  return /^\d+$/.test(str)
}

/**
 * The id a **polymorphic** reference's value carries for `targetCollection`, or
 * `null` where it names a different one.
 *
 * ⚠ Such a value is `{ relationTo, value }` at `depth: 0`, so `extractId`
 * reads `.id` and answers `null` — which would make a transcript's hold on its
 * recording invisible and let the sweep trash a file in use. Returning `value`
 * blind is worse than that bug: a `meditations`-sourced row would then protect
 * the file of the same number.
 *
 * Whether to ask this is the **walk's** answer, off `relationTo`'s own shape,
 * never a key sniffed from the stored value — the same discipline
 * `localeValues` states.
 */
function polymorphicId(value: unknown, targetCollection: string): number | null {
  if (!valueIsValueWithRelation(value)) return null
  return value.relationTo === targetCollection ? extractId(value.value) : null
}

/**
 * Extract a numeric ID from a relationship field value.
 * Handles: number, string (fully numeric only), or populated object with .id
 */
export function extractId(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && isNumericString(value)) {
    return parseInt(value, 10)
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>
    if (typeof obj.id === 'number') return obj.id
    if (typeof obj.id === 'string' && isNumericString(obj.id)) {
      return parseInt(obj.id, 10)
    }
  }
  return null
}

/**
 * One value per language where the schema walk recorded this segment as
 * localized, and the value itself where it did not.
 *
 * Reads no keys: which segments carry a locale map is the walk's answer
 * (`FieldReference.localizedAt`), from each field's own `localized` flag. So a
 * group whose subfields happen to be named like locale codes cannot be split,
 * and a translated reference cannot be missed for want of a locale list.
 */
export function localeValues(value: unknown, localized: boolean): unknown[] {
  // `isRecord` admits an array, and a locale map is never one.
  if (!localized || Array.isArray(value) || !isRecord(value)) return [value]
  return Object.values(value)
}

/**
 * Get value from a document at a given path.
 * Handles dot notation and * wildcards for arrays.
 *
 * `localizedAt` describes a `depth: 0`, `locale: 'all'` read — the only shape
 * a locale map arrives in.
 */
function getValueAtPath(
  document: Record<string, unknown>,
  pathParts: string[],
  localizedAt: readonly number[],
  segment: number = 0,
): unknown[] {
  if (pathParts.length === 0) return [document]

  const [first, ...rest] = pathParts

  if (first === '*') {
    // Current value should be an array
    if (!Array.isArray(document)) return []
    const results: unknown[] = []
    for (const item of document) {
      if (typeof item === 'object' && item !== null) {
        results.push(
          ...getValueAtPath(item as Record<string, unknown>, rest, localizedAt, segment + 1),
        )
      }
    }
    return results
  }

  const value = document[first]
  if (value === undefined || value === null) return []

  const results: unknown[] = []
  for (const candidate of localeValues(value, localizedAt.includes(segment))) {
    if (candidate === undefined || candidate === null) continue
    if (rest.length === 0) {
      results.push(candidate)
    } else if (typeof candidate === 'object') {
      results.push(
        ...getValueAtPath(candidate as Record<string, unknown>, rest, localizedAt, segment + 1),
      )
    }
  }
  return results
}

/**
 * Extract referenced IDs from a document based on a field reference.
 *
 * @param document - The document to extract IDs from
 * @param reference - The field reference describing where to find IDs
 * @returns Set of numeric IDs found at the field path
 */
export function extractIdsFromDocument(
  document: Record<string, unknown>,
  reference: FieldReference,
  targetCollection: string,
): Set<number> {
  const ids = new Set<number>()

  // Skip Lexical block fields - they require special content extraction
  if (reference.isLexicalBlock) {
    return ids
  }

  const pathParts = reference.fieldPath.split('.')
  const values = getValueAtPath(document, pathParts, reference.localizedAt)

  // A `relationTo` array is the schema saying each value names its own target.
  const idOf = Array.isArray(reference.relationTo)
    ? (value: unknown) => polymorphicId(value, targetCollection)
    : extractId

  for (const value of values) {
    if (reference.hasMany && Array.isArray(value)) {
      for (const item of value) {
        const id = idOf(item)
        if (id !== null) ids.add(id)
      }
    } else {
      const id = idOf(value)
      if (id !== null) ids.add(id)
    }
  }

  return ids
}

/**
 * Extract the target collection's ids from Lexical rich text content.
 *
 * A block node's fields are read through the block's own references, which the
 * schema walk recorded for this target. An embedded upload or relationship node
 * names its own collection, so it is matched directly.
 *
 * @param content - The Lexical content object
 * @param reference - The marker reference the walk recorded for this field
 * @param targetCollection - The collection whose ids to collect
 * @returns Set of numeric IDs found in the content
 */
export function extractIdsFromLexicalContent(
  content: unknown,
  reference: FieldReference,
  targetCollection: string,
): Set<number> {
  const ids = new Set<number>()

  if (!content || typeof content !== 'object') return ids

  const contentObj = content as Record<string, unknown>

  // An upload or relationship node carries the slug it points at (#1118).
  if (
    (contentObj.type === 'upload' || contentObj.type === 'relationship') &&
    matchesTarget(contentObj.relationTo as string | string[], targetCollection)
  ) {
    const id = extractId(contentObj.value)
    if (id !== null) ids.add(id)
  }

  if (contentObj.type === 'block' && isRecord(contentObj.fields)) {
    const fields = contentObj.fields
    for (const blockRef of reference.lexicalFields?.get(String(fields.blockType)) ?? []) {
      for (const id of extractIdsFromDocument(fields, blockRef, targetCollection)) ids.add(id)
    }
  }

  // Recursively process children
  if (contentObj.root && typeof contentObj.root === 'object') {
    for (const id of extractIdsFromLexicalContent(contentObj.root, reference, targetCollection)) {
      ids.add(id)
    }
  }

  if (Array.isArray(contentObj.children)) {
    for (const child of contentObj.children) {
      for (const id of extractIdsFromLexicalContent(child, reference, targetCollection)) {
        ids.add(id)
      }
    }
  }

  return ids
}

/** Group field references by source collection for efficient scanning. */
export function groupByCollection(references: FieldReference[]): Map<string, FieldReference[]> {
  const groups = new Map<string, FieldReference[]>()

  for (const ref of references) {
    if (!groups.has(ref.collection)) {
      groups.set(ref.collection, [])
    }
    groups.get(ref.collection)!.push(ref)
  }

  return groups
}
