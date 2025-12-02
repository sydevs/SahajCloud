import type {
  CollectionConfig,
  CollectionSlug,
  FieldBase,
  GlobalConfig,
  GlobalSlug,
  Operation,
  PayloadRequest,
  TypedUser,
  Where,
} from 'payload'

import { mergeRolePermissions } from '@/fields/PermissionsField'
import { LocaleCode } from '@/lib/locales'
import type { MergedPermissions } from '@/types/permissions'
import type { PermissionLevel } from '@/types/roles'
import type { TypedClient, TypedManager } from '@/types/users'

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if the authenticated user is an API client
 *
 * @param user - The authenticated user object from Payload request
 * @returns True if the user belongs to the 'clients' collection, false otherwise
 */
export const isAPIClient = (user: TypedUser | null): user is TypedClient => {
  return user?.collection === 'clients'
}

/**
 * Extract role slugs from the roles field structure
 *
 * @param roles - Raw roles data from database
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

  // Managers: roles is localized - object with locale keys containing string arrays
  if (locale && !Array.isArray(roles) && roles[locale]) {
    const localeRoles = roles[locale]
    return Array.isArray(localeRoles) ? localeRoles : []
  }

  return []
}

// ============================================================================
// Core Permission Checking
// ============================================================================

/**
 * Check if a user has permission for a specific collection and operation
 *
 * This is the core permission checking function used throughout the CMS.
 *
 * @param params - Permission check parameters
 * @returns Boolean indicating whether the user has permission
 */
export const hasPermission = ({
  user,
  collection,
  operation,
  field,
  locale,
  docId,
}: {
  user: TypedUser | null
  collection: string
  operation: Operation
  field?: { localized: boolean }
  locale?: LocaleCode
  docId?: string
}): boolean => {
  // Block null or inactive users
  if (!user || !user.active) return false

  const isClient = isAPIClient(user)

  // Check for admin boolean (managers only)
  if (!isClient && (user as TypedManager).admin === true) {
    return true
  }

  // Block access to special collections for non-admins
  // - managers: User management (admin only)
  // - clients: API client management (admin only)
  // - payload-jobs: System jobs (admin only)
  const restrictedCollections = ['managers', 'clients', 'payload-jobs']
  if (restrictedCollections.includes(collection)) {
    return false
  }

  // Ensure permissions are computed
  if (!user.permissions) {
    // Compute permissions on-the-fly if not present
    const currentLocale = locale || ('en' as LocaleCode)
    const roleSlugs = extractRoleSlugs(
      isClient ? (user as TypedClient).roles : (user as TypedManager).roles,
      currentLocale,
      isClient,
    )
    const collection = isClient ? 'clients' : 'managers'
    user.permissions = mergeRolePermissions(roleSlugs, collection)
  }

  // Check custom resource access for managers (document-level update permission)
  if (!isClient && operation === 'update' && docId) {
    const manager = user as TypedManager
    if (manager.customResourceAccess?.length) {
      const hasCustomAccess = manager.customResourceAccess.some(
        (access) => access.relationTo === collection && String(access.value) === String(docId),
      )
      if (hasCustomAccess) return true
    }
  }

  // Check role-based permissions
  // Type guard: ensure permissions is an object
  if (
    !user.permissions ||
    typeof user.permissions !== 'object' ||
    Array.isArray(user.permissions)
  ) {
    return false
  }

  // Get collection permissions (cast to PermissionLevel[] since we're accessing a collection, not 'projects')
  const collectionPerms = (user.permissions as MergedPermissions)[collection] as
    | PermissionLevel[]
    | undefined

  /**
   * IMPLICIT READ ACCESS FOR MANAGERS:
   * Managers with any role get implicit read access to all non-restricted collections.
   * This allows managers to browse content even if not explicitly granted read permission.
   *
   * Example: A "translator" (with pages/music roles) can still read meditations, frames, narrators, etc.
   *
   * Rationale: Improves UX by allowing content discovery without requiring explicit permissions
   * for every collection. Restricted collections (managers, clients, payload-jobs) are still blocked.
   */
  if (!isClient && !collectionPerms && operation === 'read') {
    // Check if user has any roles at all
    const hasAnyRoles = Object.keys(user.permissions as MergedPermissions).length > 0
    return hasAnyRoles
  }

  if (!collectionPerms) return false

  // Map PayloadCMS operations to our permission levels
  const permissionOp = operation as PermissionLevel

  // Handle translate permission (field-level check)
  if (collectionPerms.includes('translate')) {
    // Translate permission only works for localized fields
    if (field) {
      // Can read any field, but can only update/create localized fields
      if (operation === 'read') return true
      if (operation === 'update') return field.localized
      // Cannot create or delete with translate permission
      return false
    } else {
      // Collection-level check: read and update allowed
      return operation === 'read' || operation === 'update'
    }
  }

  // Check if user has the specific operation permission
  const hasOp = collectionPerms.includes(permissionOp)

  // API clients never get delete access, even if their role includes it
  if (isClient && operation === 'delete') {
    return false
  }

  return hasOp
}

/**
 * Create field-level access control function
 *
 * @param collection - Collection slug the field belongs to
 * @param localized - Whether the field is localized
 * @returns Field access control object
 */
export const createFieldAccess = (collection: string, localized: boolean): FieldBase['access'] => {
  const field = { localized }

  return {
    read: ({ req: { user } }: { req: PayloadRequest }) => {
      return hasPermission({ operation: 'read', user, collection, field })
    },
    create: ({ req: { user } }: { req: PayloadRequest }) => {
      return hasPermission({ operation: 'create', user, collection, field })
    },
    update: ({ req: { user } }: { req: PayloadRequest }) => {
      return hasPermission({ operation: 'update', user, collection, field })
    },
  }
}

/**
 * Create locale-aware query filter
 *
 * @param user - The authenticated user
 * @param collection - Collection slug
 * @returns Query filter or boolean
 */
export const createLocaleFilter = (user: TypedUser | null, collection: string): boolean | Where => {
  if (!user?.active) return false

  const isClient = isAPIClient(user)

  // Admin users bypass all filters
  if (!isClient && (user as TypedManager).admin === true) {
    return true
  }

  // Ensure permissions are computed and is an object
  if (
    !user.permissions ||
    typeof user.permissions !== 'object' ||
    Array.isArray(user.permissions)
  ) {
    return !isClient // Default: managers get read access, clients don't
  }

  // Get collection permissions (cast to PermissionLevel[] since we're accessing a collection, not 'projects')
  const collectionPerms = (user.permissions as MergedPermissions)[collection] as
    | PermissionLevel[]
    | undefined

  // If no permission for this collection
  if (!collectionPerms) {
    // Managers with roles get implicit read access
    const hasAnyRoles = Object.keys(user.permissions as MergedPermissions).length > 0
    return !isClient && hasAnyRoles
  }

  // For now, return true if user has any permission for this collection
  // Locale filtering is handled by localized fields at the field level
  return true
}

// ============================================================================
// Access Control Functions
// ============================================================================

/**
 * Role-based access control for collections and globals
 *
 * @param collection - Collection or global slug
 * @param options - Configuration options or additional access overrides
 * @returns Access control configuration
 */
export const roleBasedAccess = (
  collection: CollectionSlug | GlobalSlug,
  options:
    | {
        implicitRead?: boolean
      }
    | CollectionConfig['access']
    | GlobalConfig['access'] = {},
): CollectionConfig['access'] | GlobalConfig['access'] => {
  // Extract implicitRead option if present, otherwise default to true
  const implicitRead = 'implicitRead' in options ? options.implicitRead : true

  // Extract additional access overrides (e.g., custom delete function)
  const additionalAccess = Object.keys(options)
    .filter((key) => key !== 'implicitRead')
    .reduce(
      (acc, key) => {
        if (acc) {
          acc[key as keyof typeof acc] = options[key as keyof typeof options]
        }
        return acc
      },
      {} as CollectionConfig['access'],
    )

  return {
    read: ({ req: { user } }) => {
      // For collections with implicitRead disabled, require explicit permission
      if (!implicitRead) {
        return hasPermission({ operation: 'read', user, collection })
      }

      // Check if user has read permission
      const hasAccess = hasPermission({ operation: 'read', user, collection })
      if (!hasAccess) return false

      // Apply locale filtering
      return createLocaleFilter(user, collection)
    },
    create: ({ req: { user } }) => {
      return hasPermission({ operation: 'create', user, collection })
    },
    update: ({ req: { user }, id }) => {
      // Check collection-level and document-level permissions
      const docId = id ? String(id) : undefined
      const hasAccess = hasPermission({ operation: 'update', user, collection, docId })
      if (!hasAccess) return false

      // Apply locale filtering
      return createLocaleFilter(user, collection)
    },
    delete: ({ req: { user } }) => {
      return hasPermission({ operation: 'delete', user, collection })
    },
    // Merge additional access overrides
    ...additionalAccess,
  }
}
