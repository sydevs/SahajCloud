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

import type {
  BypassPermissionFunction,
  ContentSlug,
  PermissionCheckArgs,
  PermissionLevel,
  TypedAuthUser,
} from './types'
import type {
  AccessArgs,
  CollectionConfig,
  CollectionSlug,
  Config,
  Field,
  Operation,
} from 'payload'

import type { LocaleCode } from '@/lib/locales'
import type { RoleSlug } from '@/payload-types'

import {
  getPermissionsForRole,
  getProjectSlugs,
  getRoleProject,
  getRoleSlugs,
  isCollectionVisibleInProject,
  isTranslatableCollection,
} from './config'

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
 * 2. Bypass checks (if provided) → allow/deny/continue
 *    - Admin managers: allow
 *    - Inactive managers/clients: deny
 *    - customResourceAccess: allow for specific documents
 *    - Self-access: allow read/update of own document
 * 3. Extract roles (handles flat array for clients, localized for managers)
 * 4. Unified permission check (single loop per role):
 *    - Implicit read: project-based visibility
 *    - Explicit permissions: role configuration
 *    - Translate: localized field updates only
 * 5. Default → deny
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

  // 4. UNIFIED PERMISSION CHECK (single loop for efficiency)
  // Checks both implicit read and explicit permissions in one pass per role
  for (const role of roles) {
    // 4a. IMPLICIT READ ACCESS (for read operations only)
    // Both managers and API clients get the same behavior:
    // - Collections in their role's project are readable
    // - Shared collections (not in any project) are readable by all
    if (operation === 'read') {
      const project = getRoleProject(role)
      if (isCollectionVisibleInProject(collection, project || null)) return true
    }

    // 4b. EXPLICIT PERMISSIONS (via role configuration)
    const rolePermissions = getPermissionsForRole(role)
    const permissions = rolePermissions?.[collection]

    if (permissions) {
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
  roles: RoleSlug[] | Record<LocaleCode, RoleSlug[]> | undefined,
  locale?: LocaleCode,
): RoleSlug[] {
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
  args: Omit<PermissionCheckArgs, 'operation'> & { operations: PermissionLevel[] },
  bypassFn?: BypassPermissionFunction,
): boolean {
  const { operations, ...rest } = args
  return operations.some((operation) =>
    hasPermission({ ...rest, operation: operation as Operation }, bypassFn),
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
  collection: ContentSlug,
  operations: Array<'read' | 'create' | 'update' | 'delete'>,
  bypassFn?: BypassPermissionFunction,
  fieldContext?: { localized: boolean },
) {
  const accessConfig: CollectionConfig['access'] = {}

  for (const operation of operations) {
    accessConfig[operation] = ({ req, id }: AccessArgs) => {
      const args = {
        user: req.user,
        collection,
        operation,
        locale: req.locale === 'all' ? undefined : req.locale,
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
  fields: Field[],
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
    const isNonLocalized = !('localized' in field) || !field.localized

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
function createHidden(slug: ContentSlug, bypassFn?: BypassPermissionFunction) {
  // Use unknown to accommodate both CollectionConfig (ClientUser) and GlobalConfig (Manager | Client)
  return (args: { user: unknown }): boolean => {
    const user = args.user as TypedAuthUser | null
    if (!user) return true

    // Check if user has any write permission
    const hasWrite = hasAnyPermission(
      {
        user,
        collection: slug,
        operations: ['create', 'update', 'delete'],
      },
      bypassFn,
    )
    if (!hasWrite) return true

    // Check project visibility using unified logic
    return !isCollectionVisibleInProject(slug, user.currentProject ?? null)
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
      collections: config.collections?.map((collection) => {
        const slug = collection.slug as CollectionSlug
        return {
          ...collection,
          // Apply role-based access control (preserve existing overrides)
          access: {
            ...createAccessConfig(slug, ['read', 'create', 'update', 'delete'], bypassPermissions),
            ...collection.access,
          },
          admin: {
            ...collection.admin,
            // Apply project-based visibility
            hidden: createHidden(slug, bypassPermissions),
          },
          // Only apply field-level access if collection has translate permissions
          fields: isTranslatableCollection(slug)
            ? applyFieldAccessForTranslatableCollections(
                collection.fields || [],
                slug,
                bypassPermissions,
              )
            : collection.fields || [],
        }
      }),

      // Apply to globals
      globals: config.globals?.map((global) => {
        const slug = global.slug as ContentSlug
        return {
          ...global,
          // Apply role-based access control (preserve existing overrides)
          access: {
            ...createAccessConfig(slug, ['read', 'update'], bypassPermissions),
            ...global.access,
          },
          admin: {
            ...global.admin,
            // Apply project-based visibility
            hidden: createHidden(slug, bypassPermissions),
          },
        }
      }),

      // Add TypeScript schema extension for ProjectSlug and RoleSlug types
      typescript: {
        ...config.typescript,
        schema: [
          ...(config.typescript?.schema || []),
          ({ jsonSchema }) => {
            if (!jsonSchema.definitions) {
              jsonSchema.definitions = {}
            }
            jsonSchema.definitions.ProjectSlug = {
              type: 'string',
              enum: getProjectSlugs(),
            }
            jsonSchema.definitions.RoleSlug = {
              type: 'string',
              enum: getRoleSlugs(),
            }
            return jsonSchema
          },
        ],
      },
    }
  }
}
