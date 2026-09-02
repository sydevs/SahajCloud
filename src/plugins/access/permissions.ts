/**
 * Permission Checking Functions
 *
 * This module provides static functions for checking user permissions.
 * Extracted from accessPlugin.ts for better separation of concerns.
 *
 * Functions:
 * - hasPermission: Check if user has a specific permission
 * - hasAnyPermission: Check if user has any of multiple permissions (OR logic)
 */

import type {
  BypassPermissionFunction,
  PermissionCheckArgs,
  PermissionLevel,
  RoleScope,
  TypedAuthUser,
} from './types'
import type { Operation } from 'payload'

import type { LocaleCode } from '@/lib/locales'
import type { RoleSlug } from '@/payload-types'

import {
  getPermissionsForRole,
  getRoleProject,
  isCollectionVisibleInProject,
  isRestrictedCollection,
} from './config'
import { rolesForAllLocales } from './localizedRoles'

/**
 * Check if a user has permission for an operation
 *
 * Flow:
 * 1. Null user → deny
 * 2. Bypass checks (if provided) → allow/deny/continue
 *    - Admin managers: allow
 *    - Inactive managers/clients: deny
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
  // A manager whose roles could not be resolved for this scope has no grants here.
  // That is the tightening in #665: it used to fall back to the default locale.
  if (!roles.length) return false

  // 4. UNIFIED PERMISSION CHECK (single loop for efficiency)
  // Checks both implicit read and explicit permissions in one pass per role
  for (const role of roles) {
    // 4a. IMPLICIT READ ACCESS (for read operations only)
    // Both managers and API clients get the same behavior:
    // - Collections in their role's project are readable
    // - Shared collections (not in any project) are readable by all
    // - EXCEPT restricted collections (users, event-submissions): personal
    //   data never rides the shared-read rule — explicit grant or admin only.
    if (operation === 'read' && !isRestrictedCollection(collection)) {
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
 * ⚠ `Clients.roles` is deliberately NOT localized, so a client's roles are a flat
 * array and `scope` never applies to them. Everything below concerns managers.
 *
 * The three scopes are distinct on purpose — see `RoleScope`. `undefined` denies
 * rather than falling back to a locale, because every accidental locale-less check
 * used to resolve to the DEFAULT locale's roles and grant them everywhere (#665).
 *
 * @param roles - User roles (flat for clients, per-locale record for managers)
 * @param scope - Which locale's roles to evaluate, or `'union'`, or nothing
 * @returns Array of role slugs
 */
function extractRoles(
  roles: RoleSlug[] | Record<LocaleCode, RoleSlug[]> | undefined,
  scope?: RoleScope,
): RoleSlug[] {
  if (!roles) return []
  if (Array.isArray(roles)) return roles
  if (!scope) return []
  if (scope === 'union') return rolesForAllLocales(roles)
  return roles[scope] || []
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
