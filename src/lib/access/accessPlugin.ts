/**
 * Consolidated Access Plugin for PayloadCMS
 *
 * This file consolidates all access control logic into a single module:
 * - Permission checking (hasPermission, hasAnyPermission)
 * - Access config creation (collections, globals, fields)
 * - Visibility functions (admin.hidden)
 * - Main plugin export
 *
 * Simplified architecture with:
 * - Static functions (no factory pattern)
 * - Explicit lookup tables from data.ts
 * - Bypass logic configured in payload.config.ts
 */

import type { CollectionSlug, Config } from 'payload'

import type { BypassPermissionFunction, PermissionCheckArgs, TypedAuthUser } from './types'

import {
  getPermissionsForRole,
  getRoleProject,
  isCollectionVisibleInProject,
  isTranslatableCollection,
} from './config'
import { createSchemaExtension } from './schemaExtension'

// ============================================================================
// PLUGIN OPTIONS
// ============================================================================

export interface AccessPluginOptions {
  /** Whether to enable the plugin */
  enabled?: boolean
  /** Bypass function for custom access logic (inactive users, admins, etc.) */
  bypassPermissions?: BypassPermissionFunction
}

// ============================================================================
// STATIC PERMISSION CHECKER
// ============================================================================

/**
 * Check if a user has permission for an operation
 *
 * Flow:
 * 1. Null user → deny
 * 2. Bypass checks (if provided, includes self-access, inactive, admin) → allow/deny/continue
 * 3. Implicit read access (project-based, differentiated for managers vs clients)
 * 4. Extract roles (handles flat and localized)
 * 5. Check explicit permissions via getPermissionsForRole
 * 6. Default → deny
 *
 * @param args - Permission check arguments
 * @param bypassFn - Optional bypass function
 * @returns true if permission granted, false otherwise
 */
export function hasPermission(
  args: PermissionCheckArgs,
  bypassFn?: BypassPermissionFunction,
): boolean {
  const { user, collection, operation, locale, docId, field } = args

  // 1. Null user check
  if (!user) return false

  // 2. Bypass checks (if provided)
  if (bypassFn) {
    const bypassResult = bypassFn(user as TypedAuthUser, {
      collection,
      operation,
      docId,
    })
    if (bypassResult === 'allow') return true
    if (bypassResult === 'deny') return false
    // 'continue' - proceed with normal checks
  }

  // 3. Extract roles ONCE (handles flat array for clients, localized object for managers)
  const roles = extractRoles((user as TypedAuthUser).roles, locale)
  if (!roles.length) return false

  // 4. IMPLICIT READ (early exit for performance)
  // Both managers and API clients get the same implicit read behavior:
  // - Collections in their role's project are readable
  // - Shared collections (not in any project) are readable by all
  if (operation === 'read') {
    for (const role of roles) {
      const project = getRoleProject(role)
      // Unified visibility check - includes shared collections when project is null
      if (isCollectionVisibleInProject(collection, project || null)) return true
    }
  }

  // 5. EXPLICIT PERMISSIONS (read directly from ROLES via getPermissionsForRole)
  for (const role of roles) {
    const rolePermissions = getPermissionsForRole(role)
    const permissions = rolePermissions?.[collection]
    if (!permissions) continue

    // Direct operation match (includes 'update' permission granting full update access)
    if (permissions.includes(operation)) return true

    // Translate permission grants update access ONLY for localized fields
    // - Collection-level checks (field undefined) → allowed (no specific field restriction)
    // - Localized fields (field.localized === true) → allowed
    // - Non-localized fields (field.localized is false or undefined) → blocked
    if (operation === 'update' && permissions.includes('translate')) {
      if (!field) return true // Collection-level check
      if (field.localized === true) return true // Explicitly localized field
      // Non-localized field (localized is false or undefined) → fall through to deny
    }
  }

  return false
}

/**
 * Extract roles from user object
 * Handles both flat array (clients) and localized object (managers)
 *
 * @param roles - User roles (flat or localized)
 * @param locale - Current locale for localized roles
 * @returns Array of role slugs
 */
function extractRoles(
  roles: string[] | Record<string, string[]> | undefined,
  locale?: string,
): string[] {
  if (!roles) return []
  if (Array.isArray(roles)) return roles
  return locale ? roles[locale] || [] : []
}

/**
 * Check if user has ANY of the specified permissions (OR logic)
 *
 * @param args - Permission check arguments without operation
 * @param bypassFn - Optional bypass function
 * @returns true if user has at least one of the operations
 */
export function hasAnyPermission(
  args: Omit<PermissionCheckArgs, 'operation'> & { operations: string[] },
  bypassFn?: BypassPermissionFunction,
): boolean {
  const { operations, ...rest } = args
  return operations.some((operation) =>
    hasPermission({ ...rest, operation: operation as any }, bypassFn),
  )
}

// ============================================================================
// ACCESS CONFIG HELPERS
// ============================================================================

/**
 * Create unified access config for collections, globals, or fields
 * No wrappers - used directly throughout the plugin
 *
 * @param collection - Collection slug
 * @param operations - Operations to create access handlers for
 * @param bypassFn - Optional bypass function
 * @param fieldContext - Optional field context for field-level access
 * @returns Access config object with specified operations
 */
function createAccessConfig(
  collection: string,
  operations: Array<'read' | 'create' | 'update' | 'delete'>,
  bypassFn?: BypassPermissionFunction,
  fieldContext?: { localized: boolean },
) {
  const accessConfig: Record<string, (args: any) => boolean> = {}

  for (const operation of operations) {
    accessConfig[operation] = ({ req, id }: any) => {
      const args = {
        user: req.user,
        collection,
        operation,
        locale: req.locale,
        ...(id && { docId: id }),
        ...(fieldContext && { field: fieldContext }),
      }
      return hasPermission(args, bypassFn)
    }
  }

  return accessConfig
}

// ============================================================================
// FIELD ACCESS FOR TRANSLATABLE COLLECTIONS
// ============================================================================

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
 * @param fields - Array of field configurations
 * @param collection - Collection slug for permission checking
 * @param bypassFn - Optional bypass function for custom access logic
 * @returns Modified field configurations with access control
 */
function applyFieldAccessForTranslatableCollections(
  fields: any[],
  collection: CollectionSlug,
  bypassFn?: BypassPermissionFunction,
): any[] {
  return fields.map((field) => {
    // Handle tabs field type
    if (field.type === 'tabs' && 'tabs' in field) {
      return {
        ...field,
        tabs: field.tabs.map((tab: any) => {
          if ('fields' in tab) {
            return {
              ...tab,
              fields: applyFieldAccessForTranslatableCollections(tab.fields, collection, bypassFn),
            }
          }
          return tab
        }),
      }
    }

    // Handle fields with nested fields (groups, arrays, rows, collapsibles)
    if ('fields' in field && Array.isArray(field.fields)) {
      return {
        ...field,
        fields: applyFieldAccessForTranslatableCollections(field.fields, collection, bypassFn),
      }
    }

    // Handle blocks field type
    if (field.type === 'blocks' && 'blocks' in field) {
      return {
        ...field,
        blocks: field.blocks.map((block: any) => ({
          ...block,
          fields: applyFieldAccessForTranslatableCollections(block.fields, collection, bypassFn),
        })),
      }
    }

    // Check if this is an editable field (not a container, not UI)
    const isEditableField = !('fields' in field) && field.type !== 'ui'

    // Check if field is non-localized
    const isNonLocalized = !field.localized // missing or false

    // Apply access control to non-localized editable fields without existing access
    if (isEditableField && isNonLocalized && !field.access) {
      return {
        ...field,
        // Field-level access control with localized: false
        // This blocks users with only translate permission (see hasPermission logic)
        access: createAccessConfig(collection, ['read', 'create', 'update', 'delete'], bypassFn, {
          localized: false,
        }),
      }
    }

    return field
  })
}

// ============================================================================
// VISIBILITY HELPERS
// ============================================================================

/**
 * Create unified hidden function for collections and globals
 * No wrappers - used directly throughout the plugin
 *
 * Collection/global is hidden if:
 * - User has no permission for checkOperations
 * - User's currentProject doesn't match allowed projects
 *
 * @param slug - Collection or global slug
 * @param checkOperations - Operations to check for visibility
 * @param bypassFn - Optional bypass function
 * @returns Hidden function for admin UI
 */
function createHidden(slug: CollectionSlug, bypassFn?: BypassPermissionFunction) {
  return ({ user }: { user: any }) => {
    if (!user) return true

    // Check if user has any write permission
    const hasWrite = hasAnyPermission(
      {
        user: user as TypedAuthUser,
        collection: slug,
        operations: ['create', 'update', 'delete'],
      },
      bypassFn,
    )
    if (!hasWrite) return true

    // Check project visibility using unified logic
    return !isCollectionVisibleInProject(slug, user.currentProject)
  }
}

// ============================================================================
// MAIN PLUGIN EXPORT
// ============================================================================

/**
 * Access Plugin for PayloadCMS
 *
 * Applies role-based access control and project visibility to all collections and globals.
 *
 * @param options - Plugin configuration
 * @returns PayloadCMS plugin
 *
 * @example
 * ```typescript
 * plugins: [
 *   accessPlugin({
 *     enabled: true,
 *     bypassPermissions: (user, context) => {
 *       if (user.collection === 'managers') {
 *         if (user.type === 'inactive') return 'deny'
 *         if (user.type === 'admin') return 'allow'
 *       }
 *       return 'continue'
 *     },
 *   }),
 * ]
 * ```
 */
export function accessPlugin(options: AccessPluginOptions = {}): (config: Config) => Config {
  const { enabled = true, bypassPermissions } = options

  // If disabled, return no-op
  if (!enabled) {
    return (config: Config) => config
  }

  return (config: Config): Config => {
    return {
      ...config,

      // Apply to collections
      collections: config.collections?.map((collection) => ({
        ...collection,
        // Apply role-based access control (preserve existing overrides)
        access: {
          ...createAccessConfig(
            collection.slug,
            ['read', 'create', 'update', 'delete'],
            bypassPermissions,
          ),
          ...collection.access,
        },
        admin: {
          ...collection.admin,
          // Apply project-based visibility
          hidden: createHidden(collection.slug as CollectionSlug, bypassPermissions),
        },
        // Only apply field-level access if collection has translate permissions
        fields: isTranslatableCollection(collection.slug)
          ? applyFieldAccessForTranslatableCollections(
              collection.fields || [],
              collection.slug as CollectionSlug,
              bypassPermissions,
            )
          : collection.fields || [],
      })),

      // Apply to globals
      globals: config.globals?.map((global) => ({
        ...global,
        // Apply role-based access control (preserve existing overrides)
        access: {
          ...createAccessConfig(
            global.slug as CollectionSlug,
            ['read', 'update'],
            bypassPermissions,
          ),
          ...global.access,
        },
        admin: {
          ...global.admin,
          // Apply project-based visibility
          hidden: createHidden(global.slug as CollectionSlug, bypassPermissions),
        },
      })),

      // Add TypeScript schema extension
      typescript: {
        ...config.typescript,
        schema: [...(config.typescript?.schema || []), createSchemaExtension()],
      },
    }
  }
}
