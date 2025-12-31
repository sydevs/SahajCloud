/**
 * Localized Field Access for Access Plugin
 *
 * Automatically applies field-level access control to localized fields,
 * enabling the 'translate' permission to work without manual configuration.
 */

import type { Field, Tab } from 'payload'

import { createFieldAccess, type createPermissionChecker } from './permissions'

/**
 * Apply field-level access control to localized fields
 *
 * Recursively traverses the field tree and applies access control
 * to fields with `localized: true`. Handles nested structures like:
 * - tabs
 * - groups
 * - arrays
 * - rows
 * - collapsibles
 *
 * Only applies access to fields that don't already have access defined.
 *
 * @param fields - Array of field configurations
 * @param collection - Collection slug for permission checking
 * @param hasPermission - Permission checker function
 * @returns Modified field configurations with access control
 */
export function applyLocalizedFieldAccess(
  fields: Field[],
  collection: string,
  hasPermission: ReturnType<typeof createPermissionChecker>,
): Field[] {
  return fields.map((field) => {
    // Handle tabs field type
    if (field.type === 'tabs' && 'tabs' in field) {
      return {
        ...field,
        tabs: field.tabs.map((tab: Tab) => {
          if ('fields' in tab) {
            return {
              ...tab,
              fields: applyLocalizedFieldAccess(tab.fields, collection, hasPermission),
            }
          }
          return tab
        }),
      } as Field
    }

    // Handle fields with nested fields (groups, arrays, rows, collapsibles)
    if ('fields' in field && Array.isArray(field.fields)) {
      return {
        ...field,
        fields: applyLocalizedFieldAccess(field.fields, collection, hasPermission),
      } as Field
    }

    // Handle blocks field type
    if (field.type === 'blocks' && 'blocks' in field) {
      return {
        ...field,
        blocks: field.blocks.map((block) => ({
          ...block,
          fields: applyLocalizedFieldAccess(block.fields, collection, hasPermission),
        })),
      } as Field
    }

    // Apply access to localized fields that don't already have access defined
    if ('localized' in field && field.localized && !field.access) {
      return {
        ...field,
        access: createFieldAccess(hasPermission, collection, true),
      } as Field
    }

    return field
  })
}

/**
 * Check if a field has localized content anywhere in its tree
 *
 * Used to determine if field access should be applied to a parent field.
 *
 * @param field - Field configuration
 * @returns True if field or any nested field is localized
 */
export function hasLocalizedContent(field: Field): boolean {
  // Check if this field is localized
  if ('localized' in field && field.localized) {
    return true
  }

  // Check tabs
  if (field.type === 'tabs' && 'tabs' in field) {
    return field.tabs.some((tab: Tab) => {
      if ('fields' in tab) {
        return tab.fields.some(hasLocalizedContent)
      }
      return false
    })
  }

  // Check nested fields
  if ('fields' in field && Array.isArray(field.fields)) {
    return field.fields.some(hasLocalizedContent)
  }

  // Check blocks
  if (field.type === 'blocks' && 'blocks' in field) {
    return field.blocks.some((block) => block.fields.some(hasLocalizedContent))
  }

  return false
}

/**
 * Get all localized field names from a field array
 *
 * Useful for debugging and testing.
 *
 * @param fields - Array of field configurations
 * @param prefix - Optional prefix for nested field paths
 * @returns Array of localized field paths
 */
export function getLocalizedFieldPaths(fields: Field[], prefix = ''): string[] {
  const paths: string[] = []

  for (const field of fields) {
    // Only fields with a 'name' property contribute to the path
    const fieldName = 'name' in field ? (field.name as string) : ''
    const fieldPath = prefix && fieldName ? `${prefix}.${fieldName}` : fieldName || prefix

    // Check if this field is localized
    if ('localized' in field && field.localized && 'name' in field && field.name) {
      paths.push(fieldPath)
    }

    // Check tabs
    if (field.type === 'tabs' && 'tabs' in field) {
      for (const tab of field.tabs) {
        if ('fields' in tab) {
          const tabPrefix = 'name' in tab ? `${prefix}.${tab.name}` : prefix
          paths.push(...getLocalizedFieldPaths(tab.fields, tabPrefix))
        }
      }
    }

    // Check nested fields
    if ('fields' in field && Array.isArray(field.fields)) {
      paths.push(...getLocalizedFieldPaths(field.fields, fieldPath))
    }

    // Check blocks
    if (field.type === 'blocks' && 'blocks' in field) {
      for (const block of field.blocks) {
        paths.push(...getLocalizedFieldPaths(block.fields, `${fieldPath}.${block.slug}`))
      }
    }
  }

  return paths
}
