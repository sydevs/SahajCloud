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

/**
 * Represents a discovered field reference to a target collection
 */
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
}

/**
 * Check if a relationTo value includes the target collection
 */
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
): void {
  switch (field.type) {
    case 'upload': {
      const uploadField = field as UploadField
      if (matchesTarget(uploadField.relationTo, targetCollection)) {
        references.push({
          collection: collectionSlug,
          fieldPath: pathPrefix ? `${pathPrefix}.${uploadField.name}` : uploadField.name,
          fieldType: 'upload',
          hasMany: uploadField.hasMany ?? false,
          relationTo: uploadField.relationTo,
          isLexicalBlock,
          blockSlug,
        })
      }
      break
    }

    case 'relationship': {
      const relationshipField = field as RelationshipField
      if (matchesTarget(relationshipField.relationTo, targetCollection)) {
        references.push({
          collection: collectionSlug,
          fieldPath: pathPrefix ? `${pathPrefix}.${relationshipField.name}` : relationshipField.name,
          fieldType: 'relationship',
          hasMany: relationshipField.hasMany ?? false,
          relationTo: relationshipField.relationTo,
          isLexicalBlock,
          blockSlug,
        })
      }
      break
    }

    case 'tabs': {
      const tabsField = field as TabsField
      for (const tab of tabsField.tabs) {
        // Named tabs add to path, unnamed tabs don't
        const tabPath = 'name' in tab && tab.name ? `${pathPrefix}.${tab.name}` : pathPrefix
        for (const tabField of tab.fields) {
          traverseField(tabField, targetCollection, tabPath, collectionSlug, references, isLexicalBlock, blockSlug)
        }
      }
      break
    }

    case 'group': {
      const groupField = field as GroupField
      // Named groups add to path, unnamed groups don't
      const hasName = 'name' in groupField && typeof groupField.name === 'string'
      const groupPath = hasName
        ? (pathPrefix ? `${pathPrefix}.${groupField.name}` : groupField.name)
        : pathPrefix
      for (const groupChildField of groupField.fields) {
        traverseField(groupChildField, targetCollection, groupPath, collectionSlug, references, isLexicalBlock, blockSlug)
      }
      break
    }

    case 'row': {
      const rowField = field as RowField
      // Row fields don't add to path - they're just layout
      for (const rowChildField of rowField.fields) {
        traverseField(rowChildField, targetCollection, pathPrefix, collectionSlug, references, isLexicalBlock, blockSlug)
      }
      break
    }

    case 'array': {
      const arrayField = field as ArrayField
      const arrayPath = pathPrefix ? `${pathPrefix}.${arrayField.name}.*` : `${arrayField.name}.*`
      for (const arrayChildField of arrayField.fields) {
        traverseField(arrayChildField, targetCollection, arrayPath, collectionSlug, references, isLexicalBlock, blockSlug)
      }
      break
    }

    case 'blocks': {
      // Note: This is for PayloadCMS blocks fields (not Lexical blocks)
      // Lexical blocks are handled separately via richText field
      const blocksField = field as { name: string; blocks: Block[] }
      const blocksPath = pathPrefix ? `${pathPrefix}.${blocksField.name}.*` : `${blocksField.name}.*`
      for (const block of blocksField.blocks) {
        const blockPath = `${blocksPath}.${block.slug}`
        for (const blockField of block.fields) {
          traverseField(blockField, targetCollection, blockPath, collectionSlug, references, isLexicalBlock, blockSlug)
        }
      }
      break
    }

    case 'collapsible': {
      const collapsibleField = field as CollapsibleField
      // Collapsible fields don't add to path - they're just layout
      for (const collapsibleChildField of collapsibleField.fields) {
        traverseField(collapsibleChildField, targetCollection, pathPrefix, collectionSlug, references, isLexicalBlock, blockSlug)
      }
      break
    }

    case 'richText': {
      // Rich text fields may contain Lexical blocks with media references.
      // Instead of trying to introspect block definitions (which are complex to access at runtime),
      // we mark the richText field as containing Lexical content that needs generic traversal.
      // The actual ID extraction happens at content scan time using extractIdsFromLexicalContent().
      const richTextField = field as { name: string; editor?: unknown }
      if (richTextField.editor) {
        // Add a marker reference indicating this field contains Lexical content
        // that should be traversed for the target collection
        references.push({
          collection: collectionSlug,
          fieldPath: pathPrefix ? `${pathPrefix}.${richTextField.name}` : richTextField.name,
          fieldType: 'upload',
          hasMany: true,
          relationTo: targetCollection,
          isLexicalBlock: true,
          // No specific blockSlug - generic Lexical traversal
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
 * Get value from a document at a given path.
 * Handles dot notation and * wildcards for arrays.
 */
function getValueAtPath(document: Record<string, unknown>, pathParts: string[]): unknown[] {
  if (pathParts.length === 0) return [document]

  const [first, ...rest] = pathParts

  if (first === '*') {
    // Current value should be an array
    if (!Array.isArray(document)) return []
    const results: unknown[] = []
    for (const item of document) {
      if (typeof item === 'object' && item !== null) {
        results.push(...getValueAtPath(item as Record<string, unknown>, rest))
      }
    }
    return results
  }

  const value = document[first]
  if (value === undefined || value === null) return []

  if (rest.length === 0) return [value]

  if (typeof value === 'object') {
    return getValueAtPath(value as Record<string, unknown>, rest)
  }

  return []
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
): Set<number> {
  const ids = new Set<number>()

  // Skip Lexical block fields - they require special content extraction
  if (reference.isLexicalBlock) {
    return ids
  }

  const pathParts = reference.fieldPath.split('.')
  const values = getValueAtPath(document, pathParts)

  for (const value of values) {
    if (reference.hasMany && Array.isArray(value)) {
      for (const item of value) {
        const id = extractId(item)
        if (id !== null) ids.add(id)
      }
    } else {
      const id = extractId(value)
      if (id !== null) ids.add(id)
    }
  }

  return ids
}

/**
 * Extract IDs from Lexical rich text content using generic traversal.
 * This function scans all block nodes and extracts upload/relationship IDs
 * from any field that looks like an upload reference.
 *
 * @param content - The Lexical content object
 * @returns Set of numeric IDs found in the content
 */
export function extractIdsFromLexicalContent(content: unknown): Set<number> {
  const ids = new Set<number>()

  if (!content || typeof content !== 'object') return ids

  const contentObj = content as Record<string, unknown>

  // Check if this is a block node
  if (contentObj.type === 'block' && contentObj.fields) {
    const fields = contentObj.fields as Record<string, unknown>

    // Generic extraction: scan all fields for ID-like values
    for (const [fieldName, value] of Object.entries(fields)) {
      // Skip metadata fields
      if (fieldName === 'id' || fieldName === 'blockType' || fieldName === 'blockName') continue

      // Handle direct upload field (e.g., TextBoxBlock.image)
      const directId = extractId(value)
      if (directId !== null) {
        ids.add(directId)
        continue
      }

      // Handle array fields (e.g., GalleryBlock.items or LayoutBlock.items)
      if (Array.isArray(value)) {
        for (const item of value) {
          // Could be direct ID (GalleryBlock.items)
          const itemId = extractId(item)
          if (itemId !== null) {
            ids.add(itemId)
            continue
          }

          // Could be object with nested fields (LayoutBlock.items[].image)
          if (typeof item === 'object' && item !== null) {
            const itemObj = item as Record<string, unknown>
            for (const [nestedFieldName, nestedValue] of Object.entries(itemObj)) {
              // Skip array item metadata
              if (nestedFieldName === 'id') continue

              const nestedId = extractId(nestedValue)
              if (nestedId !== null) {
                ids.add(nestedId)
              }
            }
          }
        }
      }
    }
  }

  // Recursively process children
  if (contentObj.root && typeof contentObj.root === 'object') {
    const rootIds = extractIdsFromLexicalContent(contentObj.root)
    for (const id of rootIds) ids.add(id)
  }

  if (Array.isArray(contentObj.children)) {
    for (const child of contentObj.children) {
      const childIds = extractIdsFromLexicalContent(child)
      for (const id of childIds) ids.add(id)
    }
  }

  return ids
}

/**
 * Group field references by source collection for efficient scanning.
 */
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
