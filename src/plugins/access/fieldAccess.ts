/**
 * Field-Level Access Control
 *
 * This module provides functions for applying field-level access control
 * to collections with translate permissions.
 *
 * Functions:
 * - applyFieldAccessForTranslatableCollections: Apply access to non-localized fields
 */

import type { BypassPermissionFunction } from './types'
import type { Block, CollectionSlug, Field, Tab } from 'payload'

import { createFieldAccessConfig } from './accessConfigs'

/**
 * Apply field-level access control to non-localized fields in translatable collections
 *
 * For collections with translate permissions, this restricts access to non-localized fields
 * so that users with only translate permission cannot modify them.
 *
 * Recursively traverses the field tree and applies access control to fields that are:
 * - NOT localized (localized is false or missing)
 * - NOT container fields (no 'fields' property)
 * - NOT ui fields (type !== 'ui')
 *
 * Users with explicit update permission will still have access via standard permission checking.
 *
 * Note: Type assertions are used because the Field union type is complex and some field types
 * (like JoinField) have restricted access configurations. The assertions are safe because
 * we only modify fields that are eligible for access control (editable, non-localized).
 *
 * @param fields - Array of field configurations
 * @param collection - Collection slug for permission checking
 * @param bypassFn - Optional bypass function for custom access logic
 * @returns Modified field configurations with access control
 */
export function applyFieldAccessForTranslatableCollections(
  fields: Field[],
  collection: CollectionSlug,
  bypassFn?: BypassPermissionFunction,
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
              fields: applyFieldAccessForTranslatableCollections(tab.fields, collection, bypassFn),
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
        fields: applyFieldAccessForTranslatableCollections(field.fields, collection, bypassFn),
      } as Field
    }

    // Handle blocks field type
    if (field.type === 'blocks' && 'blocks' in field) {
      return {
        ...field,
        blocks: field.blocks.map((block: Block) => ({
          ...block,
          fields: applyFieldAccessForTranslatableCollections(block.fields, collection, bypassFn),
        })),
      } as Field
    }

    // Check if this is an editable field (not a container, not UI)
    const isEditableField = !('fields' in field) && field.type !== 'ui'

    // Check if field is non-localized
    const isNonLocalized = !('localized' in field) || !field.localized

    // Apply access control to non-localized editable fields without existing access
    if (isEditableField && isNonLocalized && !field.access) {
      return {
        ...field,
        // Field-level access control with localized: false
        // This blocks users with only translate permission (see hasPermission logic)
        access: createFieldAccessConfig(collection, ['read', 'create', 'update'], bypassFn, {
          localized: false,
        }),
      } as Field
    }

    return field
  })
}
