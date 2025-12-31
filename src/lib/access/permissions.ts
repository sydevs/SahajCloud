/**
 * Permission Checking for Access Plugin
 *
 * Core permission checking using pre-computed lookup tables for O(1) access.
 * Handles bypass functions, translate permission, and project-based implicit read access.
 *
 * Note: Inactive and admin checks are now handled by bypass functions in payload.config.ts
 */

import type {
  AccessPluginOptions,
  PermissionCheckArgs,
  PermissionLevel,
  PermissionLookup,
  TypedClient,
  TypedManager,
} from './types'
import type { CollectionConfig, GlobalConfig, PayloadRequest } from 'payload'

import {
  CLIENT_ROLE_PROJECTS,
  MANAGER_ROLE_PROJECTS,
  PROJECT_COLLECTIONS,
} from '@/generated/access'
import type { LocaleCode } from '@/lib/locales'

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if the authenticated user is an API client
 */
export function isAPIClient(user: { collection?: string } | null): user is TypedClient {
  return user?.collection === 'clients'
}

/**
 * Extract role slugs from the roles field structure
 *
 * Handles both localized (managers) and non-localized (clients) role structures.
 *
 * @param roles - Raw roles data from user
 * @param locale - Locale to extract roles for (managers only)
 * @param isClient - Whether this is for a client
 * @returns Array of role slug strings
 */
function extractRoleSlugs(
  roles: string[] | Record<LocaleCode, string[]> | undefined,
  locale?: LocaleCode,
  isClient = false,
): string[] {
  if (!roles) return []

  if (isClient) {
    // Clients: roles is an array of strings
    return Array.isArray(roles) ? roles : []
  }

  // Managers: roles can be either:
  // 1. Localized object: { en: ['translator'], cs: ['meditations-editor'] }
  // 2. Flat array: ['translator', 'meditations-editor'] (for tests or non-localized contexts)

  if (Array.isArray(roles)) {
    return roles
  }

  // Handle localized object
  if (locale && roles[locale]) {
    const localeRoles = roles[locale]
    return Array.isArray(localeRoles) ? localeRoles : []
  }

  return []
}

// ============================================================================
// Core Permission Checking
// ============================================================================

/**
 * Create a permission checker function with the lookup tables and bypass functions bound
 *
 * This creates a closure over the lookup tables for efficient permission checking.
 *
 * @param lookup - Pre-computed permission lookup table
 * @param bypass - Optional bypass functions from plugin config
 * @returns Permission checker function
 */
export function createPermissionChecker(
  lookup: PermissionLookup,
  bypass: AccessPluginOptions['bypass'],
) {
  /**
   * Check if a user has permission for a specific collection and operation
   *
   * Permission checking flow:
   * 1. Block null users
   * 2. Call user-provided bypass function (handles inactive, admin, customResourceAccess)
   * 3. Self-access check (user can read/update their own document if collection matches)
   * 4. O(1) permission lookup
   * 5. Handle translate permission for localized fields
   * 6. Handle project-based implicit read access
   *
   * @param args - Permission check arguments
   * @returns Boolean indicating whether the user has permission
   */
  return function hasPermission({
    user,
    collection,
    operation,
    field,
    locale,
    docId,
  }: PermissionCheckArgs): boolean {
    // 1. Block null users
    if (!user) return false

    const isClient = isAPIClient(user)

    // 2. Call user-provided bypass function
    if (!isClient && bypass?.managers) {
      const result = bypass.managers({
        user: user as TypedManager,
        collection,
        operation,
        docId,
      })
      if (result === 'allow') return true
      if (result === 'deny') return false
      // 'continue' falls through to normal checking
    }

    if (isClient && bypass?.clients) {
      const result = bypass.clients({
        user: user as TypedClient,
        collection,
        operation,
      })
      if (result === 'allow') return true
      if (result === 'deny') return false
      // 'continue' falls through to normal checking
    }

    // 3. Self-access check: user can read/update their own document
    // Must match both collection AND document id
    if (docId && user.collection === collection && String(user.id) === String(docId)) {
      if (operation === 'read' || operation === 'update') {
        return true
      }
    }

    // 4. Get user's roles (locale-aware for managers) and perform O(1) permission lookup
    const currentLocale = locale || ('en' as LocaleCode)
    const roles = extractRoleSlugs(
      isClient ? (user as TypedClient).roles : (user as TypedManager).roles,
      currentLocale,
      isClient,
    )

    // 5. O(1) permission lookup
    const lookupTable = isClient ? lookup.clients : lookup.managers

    for (const role of roles) {
      const collectionPerms = lookupTable.get(role)?.get(collection)

      if (collectionPerms) {
        // Handle translate permission for localized fields
        if (collectionPerms.has('translate')) {
          if (field) {
            // Can read any field
            if (operation === 'read') return true
            // Can only update localized fields
            if (operation === 'update') return field.localized
            // Cannot create or delete with translate permission
            continue
          } else {
            // Collection-level check: read and update allowed
            if (operation === 'read' || operation === 'update') return true
            continue
          }
        }

        // Check if role has the specific operation permission
        if (collectionPerms.has(operation as PermissionLevel)) {
          return true
        }
      }
    }

    // 6. Handle project-based implicit read access
    // Both managers and clients get implicit read access to their project's collections
    if (operation === 'read' && roles.length > 0) {
      const roleProjectLookup = isClient ? CLIENT_ROLE_PROJECTS : MANAGER_ROLE_PROJECTS

      for (const role of roles) {
        const project = roleProjectLookup[role]
        if (project) {
          const projectCollections = PROJECT_COLLECTIONS[project]
          if (projectCollections?.includes(collection)) {
            return true
          }
        }
      }
    }

    return false
  }
}

// ============================================================================
// Access Control Factory Functions
// ============================================================================

/**
 * Create access control configuration for a collection
 *
 * @param hasPermission - Permission checker function
 * @param collectionSlug - Collection slug
 * @returns Collection access configuration
 */
export function createCollectionAccess(
  hasPermission: ReturnType<typeof createPermissionChecker>,
  collectionSlug: string,
): CollectionConfig['access'] {
  return {
    read: ({ req }) => {
      const result = hasPermission({
        user: req.user,
        collection: collectionSlug,
        operation: 'read',
        locale: req.locale as LocaleCode,
      })
      if (!result) return false
      // Return true to allow access (locale filtering is handled at field level)
      return true
    },
    create: ({ req }) => {
      return hasPermission({
        user: req.user,
        collection: collectionSlug,
        operation: 'create',
        locale: req.locale as LocaleCode,
      })
    },
    update: ({ req, id }) => {
      const result = hasPermission({
        user: req.user,
        collection: collectionSlug,
        operation: 'update',
        locale: req.locale as LocaleCode,
        docId: id,
      })
      if (!result) return false
      return true
    },
    delete: ({ req }) => {
      return hasPermission({
        user: req.user,
        collection: collectionSlug,
        operation: 'delete',
        locale: req.locale as LocaleCode,
      })
    },
  }
}

/**
 * Create access control configuration for a global
 *
 * @param hasPermission - Permission checker function
 * @param globalSlug - Global slug
 * @returns Global access configuration
 */
export function createGlobalAccess(
  hasPermission: ReturnType<typeof createPermissionChecker>,
  globalSlug: string,
): GlobalConfig['access'] {
  return {
    read: ({ req }) => {
      return hasPermission({
        user: req.user,
        collection: globalSlug,
        operation: 'read',
        locale: req.locale as LocaleCode,
      })
    },
    update: ({ req }) => {
      return hasPermission({
        user: req.user,
        collection: globalSlug,
        operation: 'update',
        locale: req.locale as LocaleCode,
      })
    },
  }
}

/**
 * Create field-level access control
 *
 * @param hasPermission - Permission checker function
 * @param collection - Collection slug the field belongs to
 * @param localized - Whether the field is localized
 * @returns Field access control object
 */
export function createFieldAccess(
  hasPermission: ReturnType<typeof createPermissionChecker>,
  collection: string,
  localized: boolean,
) {
  const field = { localized }

  return {
    read: ({ req }: { req: PayloadRequest }) => {
      return hasPermission({
        user: req.user,
        collection,
        operation: 'read',
        field,
        locale: req.locale as LocaleCode,
      })
    },
    create: ({ req }: { req: PayloadRequest }) => {
      return hasPermission({
        user: req.user,
        collection,
        operation: 'create',
        field,
        locale: req.locale as LocaleCode,
      })
    },
    update: ({ req }: { req: PayloadRequest }) => {
      return hasPermission({
        user: req.user,
        collection,
        operation: 'update',
        field,
        locale: req.locale as LocaleCode,
      })
    },
  }
}

/**
 * Check if user has write permission (create, update, or delete) for a collection
 *
 * Used by visibility functions to determine if collection should be shown.
 *
 * @param hasPermission - Permission checker function
 * @param user - The authenticated user
 * @param collection - Collection slug
 * @returns True if user has any write permission
 */
export function hasWritePermission(
  hasPermission: ReturnType<typeof createPermissionChecker>,
  user: PermissionCheckArgs['user'],
  collection: string,
): boolean {
  return (
    hasPermission({ user, collection, operation: 'create' }) ||
    hasPermission({ user, collection, operation: 'update' }) ||
    hasPermission({ user, collection, operation: 'delete' })
  )
}

