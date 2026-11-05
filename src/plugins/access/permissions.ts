/**
 * Permission Checking Functions
 *
 * This module provides static functions for checking user permissions.
 * Extracted from accessPlugin.ts for better separation of concerns.
 *
 * Functions:
 * - hasPermission: Check if user has a specific permission
 * - hasAnyPermission: Check if user has any of multiple permissions (OR logic)
 * - holdsCollectionPermission: hasPermission over a request, locale scope applied
 */

import type {
  BypassPermissionFunction,
  PermissionCheckArgs,
  PermissionLevel,
  RoleScope,
  TypedAuthUser,
} from './types'
import type { Operation, PayloadRequest } from 'payload'

import type { LocaleCode } from '@/lib/locales'
import type { RoleSlug } from '@/payload-types'

import { bypassPermissions } from './bypassPermissions'
import {
  getPermissionsForRole,
  getRoleProject,
  isCollectionVisibleInProject,
  isRestrictedCollection,
  virtualRoles,
} from './config'
import { rolesForAllLocales, roleScopeFromLocale } from './localizedRoles'

/**
 * Check if a user has permission for an operation
 *
 * Flow:
 * 1. Null user → deny
 * 2. Bypass checks (if provided) → allow/deny/continue
 *    - Admin managers: allow
 *    - Inactive managers/clients: deny
 *    - Self-access: allow read of own document, and update for managers
 * 3. Extract roles (flat for clients, localized for managers, plus derived)
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
  const roles = extractRoles(user as TypedAuthUser, locale)
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
    // - EXCEPT restricted collections: personal data and credentials never
    //   ride the shared-read rule — explicit grant or admin only.
    //   `config/projects.ts` names the set and says why each one is on it. A
    //   client reading its own row was already answered by step 2's
    //   self-access.
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
 * Every role this user holds for the scope — the stored ones, plus the roles
 * their page, region and event listings derive (`virtualRoles`).
 *
 * ⚠ `Clients.roles` is deliberately NOT localized, so a client's roles are a flat
 * array and `scope` never applies to them. Everything below concerns managers.
 *
 * The three scopes are distinct on purpose — see `RoleScope`. `undefined` denies
 * rather than falling back to a locale, because every accidental locale-less check
 * used to resolve to the DEFAULT locale's roles and grant them everywhere (#665).
 *
 * ⚠ **A derived role is held in every CONFIGURED locale, and in no other
 * scope.** The listing it comes from is not localized, so it is granted
 * whenever the scope resolves — but `?locale=all`, and any locale outside
 * `LOCALES`, still resolve nothing, which is what the `undefined` scope means
 * and what #665 left it meaning. Appending ahead of that test would answer a
 * request that names no evaluable locale. `'union'` does resolve, and must: it
 * is admin-UI nav visibility, which would otherwise be empty for a manager
 * whose only role is derived.
 *
 * ⚠ **And only for a `managers` caller**, spelled as an allowlist like the
 * self-access bypass. The joins are declared on `Managers` alone, so no client
 * document carries one — but `virtualRoles` reads a shape, not a collection,
 * and a manager role reached by a published API key is the one mistake here
 * that cannot be undone.
 *
 * @param user - The authenticated user
 * @param scope - Which locale's roles to evaluate, or `'union'`, or nothing
 * @returns Array of role slugs
 */
function extractRoles(user: TypedAuthUser, scope?: RoleScope): RoleSlug[] {
  const stored = storedRoles(user.roles, scope)
  if (!scope || user.collection !== 'managers') return stored
  return [...stored, ...virtualRoles(user)]
}

/** The roles written on the document, for the scope. */
function storedRoles(
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

/**
 * Whether this request's user holds one collection operation **by their
 * roles**, in the locale the request names.
 *
 * The boolean behind `requireCollectionPermission` (`@/lib/endpoints`), for a
 * caller with no 403 envelope to return — a collection hook deciding whether a
 * write is one its author is authorised to make. Both read the locale scope
 * from here, so there is one owner of it (#701, #665): a request naming no
 * locale resolves to the **default** locale, and a manager whose roles live
 * only elsewhere is then denied. `roleScopeFromLocale` is also what refuses
 * `all` and stops a request naming `union`.
 *
 * ⚠ **Role grants only, and that is the point.** A collection's own `update`
 * is wider: when these grants deny, `createAccessConfig` falls back to
 * document-level manager access, so a manager merely *named* on a row holds
 * `update` on it with no grant at all (`accessConfigs.ts`). That is right for
 * editing the row and wrong for a privileged decision taken through it — a
 * hook asking "may this user decide" must not read the collection's `update`,
 * or being assigned a row becomes authority over what accepting it writes.
 */
export function holdsCollectionPermission(args: {
  req: PayloadRequest
  collection: PermissionCheckArgs['collection']
  operation: PermissionCheckArgs['operation']
}): boolean {
  const { req, collection, operation } = args

  return hasPermission(
    { user: req.user, collection, operation, locale: roleScopeFromLocale(req.locale) },
    bypassPermissions,
  )
}
