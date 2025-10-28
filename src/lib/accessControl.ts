import { Manager } from '@/payload-types'
import type {
  CollectionConfig,
  CollectionSlug,
  Field,
  FieldBase,
  Operation,
  PayloadRequest,
  TypedUser,
} from 'payload'
import { LOCALES, LocaleCode } from '@/lib/locales'

const PERMISSION_LEVELS = ['read', 'translate', 'manage'] as const
type PermissionLevel = (typeof PERMISSION_LEVELS)[number]

export const PERMISSION_COLLECTIONS = [
  'meditations',
  'music',
  'frames',
  'media',
  'lessons',
  'pages',
  'external-videos',
] as const
type PermissionCollection = (typeof PERMISSION_COLLECTIONS)[number]

type PermissionLocale = LocaleCode | 'all'

// Permission types
export interface Permission {
  allowedCollection: PermissionCollection
  level: PermissionLevel
  locales: PermissionLocale[]
}

const LOCALE_OPTIONS: Array<{ label: string; value: PermissionLocale }> = [
  {
    label: 'All Locales',
    value: 'all',
  },
  ...LOCALES.map((l) => ({
    label: l.label,
    value: l.code as PermissionLocale,
  })),
]

/**
 * Check if the authenticated user is an API client
 *
 * @param user - The authenticated user object from Payload request
 * @returns True if the user belongs to the 'clients' collection, false otherwise
 *
 * @example
 * ```typescript
 * if (isAPIClient(req.user)) {
 *   // Handle API client-specific logic
 *   // API clients have restricted permissions
 * }
 * ```
 */
export const isAPIClient = (user: TypedUser | null) => {
  return user?.collection === 'clients'
}

/**
 * Check if a user has permission for a specific collection and operation
 *
 * This is the core permission checking function used throughout the CMS to enforce
 * access control for both managers and API clients.
 *
 * @param params - Permission check parameters
 * @param params.user - The authenticated user (Manager or API Client)
 * @param params.collection - Collection slug to check permissions for (e.g., 'pages', 'meditations')
 * @param params.operation - CRUD operation being attempted ('create', 'read', 'update', 'delete')
 * @param params.field - Optional field object with localized flag for field-level checks
 * @param params.locale - Optional locale code for locale-restricted content access
 *
 * @returns Boolean indicating whether the user has permission for the requested operation
 *
 * @remarks
 * Permission hierarchy and special cases:
 * - **Admin users**: Bypass all restrictions (always returns true)
 * - **Inactive users**: Always denied (returns false)
 * - **Managers/Clients collections**: Blocked for all non-admin users
 * - **API clients**: Never get delete access, even with Manage permission
 * - **Managers**: Have read access by default to all collections
 * - **Translate level**: Only allows editing localized fields, no create/delete
 * - **Locale restrictions**: Content filtered by user's permitted locales
 *
 * @example
 * Basic permission check
 * ```typescript
 * const canUpdate = hasPermission({
 *   user: req.user,
 *   collection: 'pages',
 *   operation: 'update'
 * })
 * ```
 *
 * @example
 * Check with locale restriction
 * ```typescript
 * const canEditSpanish = hasPermission({
 *   user: req.user,
 *   collection: 'pages',
 *   operation: 'update',
 *   locale: 'es'
 * })
 * ```
 *
 * @example
 * Field-level check for localized content
 * ```typescript
 * const canEditField = hasPermission({
 *   user: req.user,
 *   collection: 'pages',
 *   operation: 'update',
 *   field: { localized: true },
 *   locale: 'fr'
 * })
 * ```
 */
export const hasPermission = ({
  user,
  collection,
  operation,
  field,
  locale,
}: {
  user: TypedUser | null
  collection: string
  operation: Operation
  field?: { localized: boolean }
  locale?: LocaleCode
}): boolean => {
  const isClient = user?.collection === 'clients'

  // Block inactive or null users
  if (!user?.active) return false
  // Admin users bypass all restrictions
  if (!isClient && (user as Manager).admin) return true
  // Block access to Managers and Clients for non-admins
  if (collection === 'managers' || collection === 'clients') return false
  // Managers have read access by default
  if (!isClient && operation === 'read') return true

  // Find permission for this collection
  const permissions = user.permissions || []
  const permission = permissions.find((p) => p.allowedCollection === collection)
  if (!permission) return false

  // Check locale access if locale is specified
  if (locale && !permission.locales.includes('all') && !permission.locales.includes(locale)) {
    return false
  }

  // Check operation permissions based on level
  if (isClient) {
    // API client permissions
    switch (permission.level) {
      case 'read':
        return operation === 'read'
      case 'manage':
        // API clients never get delete access, even with Manage permission
        return operation !== 'delete'
      default:
        return false
    }
  } else {
    // Manager permissions
    switch (permission.level) {
      case 'translate':
        // Translate managers cannot create or delete
        if (field) {
          return field.localized && operation !== 'delete'
        } else {
          return operation === 'read' || operation === 'update'
        }
      case 'manage':
        return true // Full access for manage managers
      default:
        return operation === 'read' // Default read access for managers
    }
  }
}

/**
 * Create field-level access control function for use in collection field definitions
 *
 * Generates a field access control object that integrates with Payload's field-level
 * permissions, particularly useful for restricting access to localized fields for
 * translators who should only edit content in specific languages.
 *
 * @param collection - Collection slug the field belongs to
 * @param localized - Whether the field is localized (supports multiple languages)
 *
 * @returns Field access control object with read, create, and update functions
 *
 * @remarks
 * This function is typically used for fields that need special access control beyond
 * the collection-level permissions. For example, translator users should only be able
 * to edit localized fields (title, content) but not non-localized fields (slug, IDs).
 *
 * @example
 * Using in a field definition
 * ```typescript
 * {
 *   name: 'title',
 *   type: 'text',
 *   localized: true,
 *   access: createFieldAccess('pages', true)
 * }
 * ```
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
 * Permission-based access control for collections accessible to both managers and API clients
 *
 * This is the standard access control function used by most content collections. It provides
 * granular permission checking combined with locale filtering to ensure users only access
 * content they're authorized for.
 *
 * @param collection - Collection slug to apply permissions to
 * @param access - Optional additional access control overrides to merge
 *
 * @returns Complete access control configuration for the collection
 *
 * @remarks
 * **Key Features:**
 * - Enforces permission-based CRUD operations
 * - Applies locale filtering for read and update operations
 * - Supports both manager and API client authentication
 * - Respects admin bypass for full access
 *
 * **Locale Filtering:**
 * Users with locale-restricted permissions will only see/edit content
 * in their permitted locales, enforced via MongoDB query filters.
 *
 * @example
 * Basic usage in collection config
 * ```typescript
 * export const Pages: CollectionConfig = {
 *   slug: 'pages',
 *   access: permissionBasedAccess('pages'),
 *   fields: [...]
 * }
 * ```
 *
 * @example
 * With additional access overrides
 * ```typescript
 * export const Meditations: CollectionConfig = {
 *   slug: 'meditations',
 *   access: permissionBasedAccess('meditations', {
 *     // Override unlock to allow all authenticated users
 *     unlock: ({ req }) => !!req.user
 *   }),
 *   fields: [...]
 * }
 * ```
 */
export const permissionBasedAccess = (
  collection: CollectionSlug,
  access: CollectionConfig['access'] = {},
): CollectionConfig['access'] => {
  return {
    read: ({ req: { user } }) => {
      const hasAccess = hasPermission({ operation: 'read', user, collection })
      if (!hasAccess) return false

      // Return a filter which will restrict access to a specific locale
      return createLocaleFilter(user, collection)
    },
    create: ({ req: { user } }) => {
      return hasPermission({ operation: 'create', user, collection })
    },
    update: ({ req: { user } }) => {
      const hasAccess = hasPermission({ operation: 'update', user, collection })
      if (!hasAccess) return false

      // Return a filter which will restrict access to a specific locale
      return createLocaleFilter(user, collection)
    },
    delete: ({ req: { user } }) => {
      return hasPermission({ operation: 'delete', user, collection })
    },
    ...access,
  }
}

/**
 * Admin-only access control for sensitive collections (Managers and Clients)
 *
 * Enforces strict access control limiting all CRUD operations to admin users only.
 * API clients are completely blocked from accessing these collections regardless of
 * their permission configuration.
 *
 * @param access - Optional additional access control overrides to merge
 *
 * @returns Access control configuration that restricts all operations to admins
 *
 * @remarks
 * **Security Model:**
 * - Only managers with `admin: true` can perform ANY operation
 * - API clients are explicitly blocked (returns false for all operations)
 * - No permission-based access - strictly admin or nothing
 *
 * **Use Cases:**
 * - Managers collection (user management)
 * - Clients collection (API key management)
 * - Any collection containing sensitive system configuration
 *
 * @example
 * Using in Managers collection
 * ```typescript
 * export const Managers: CollectionConfig = {
 *   slug: 'managers',
 *   access: adminOnlyAccess(),
 *   auth: true,
 *   fields: [...]
 * }
 * ```
 */
export const adminOnlyAccess = (
  access: CollectionConfig['access'] = {},
): CollectionConfig['access'] => {
  return {
    ...access,
    read: ({ req }) => (!isAPIClient(req.user) && req.user?.admin) || false,
    create: ({ req }) => (!isAPIClient(req.user) && req.user?.admin) || false,
    update: ({ req }) => (!isAPIClient(req.user) && req.user?.admin) || false,
    delete: ({ req }) => (!isAPIClient(req.user) && req.user?.admin) || false,
  }
}

/**
 * Create a permissions array field for Managers or Clients collections
 *
 * Generates a complete Payload field configuration for the permissions array,
 * allowing fine-grained control over which collections and locales a user can access.
 *
 * @param params - Configuration options
 * @param params.excludedLevels - Permission levels to exclude from the options (e.g., ['translate'] for API clients)
 *
 * @returns Payload field configuration for permissions array
 *
 * @remarks
 * **Permission Levels:**
 * - **Read**: View-only access to collection content
 * - **Translate**: Edit localized fields only (for content translators)
 * - **Manage**: Full create, update, delete access within specified locales
 *
 * **Field Structure:**
 * Each permission entry contains:
 * - `allowedCollection`: Which collection the permission applies to
 * - `level`: Permission level (read, translate, manage)
 * - `locales`: Array of locale codes or 'all' for unrestricted access
 *
 * @example
 * For Managers (includes all permission levels)
 * ```typescript
 * export const Managers: CollectionConfig = {
 *   slug: 'managers',
 *   fields: [
 *     createPermissionsField({ excludedLevels: ['read'] })
 *   ]
 * }
 * ```
 *
 * @example
 * For API Clients (excludes translate level)
 * ```typescript
 * export const Clients: CollectionConfig = {
 *   slug: 'clients',
 *   fields: [
 *     createPermissionsField({ excludedLevels: ['translate'] })
 *   ]
 * }
 * ```
 */
export const createPermissionsField = ({
  excludedLevels,
}: {
  excludedLevels: PermissionLevel[]
}): Field => {
  const permissionLevels = PERMISSION_LEVELS.filter(
    (level) => !excludedLevels.includes(level as PermissionLevel),
  ).map((v) => {
    return {
      label: v.charAt(0).toUpperCase() + v.slice(1),
      value: v,
    }
  })

  return {
    name: 'permissions',
    type: 'array',
    admin: {
      isSortable: false,
      description:
        'Granular permissions for specific collections and locales. Adding the same collection multiple times may cause inconsistent behaviour.',
      condition: (data) => !data.admin, // Hide permissions field for admin users
      components: {
        RowLabel: '@/components/admin/PermissionRowLabel',
      },
    },
    fields: [
      {
        name: 'allowedCollection',
        type: 'select',
        required: true,
        options: PERMISSION_COLLECTIONS.map((v) => {
          return {
            label: v.charAt(0).toUpperCase() + v.slice(1),
            value: v,
          }
        }),
        admin: {
          description: 'Select the collection to grant permissions for',
        },
      },
      {
        name: 'level',
        type: 'radio',
        required: true,
        options: permissionLevels,
        admin: {
          description:
            'Translate: Can edit localized fields only. Manage: Full create/update/delete access within specified locales.',
        },
      },
      {
        name: 'locales',
        type: 'select',
        hasMany: true,
        required: true,
        options: LOCALE_OPTIONS,
        admin: {
          description:
            'Select which locales this permission applies to. "All Locales" grants unrestricted locale access.',
        },
      },
    ],
  }
}

/**
 * Create locale-aware query filter for collections
 *
 * Generates a MongoDB query filter that restricts document access based on user's
 * permitted locales. Used internally by `permissionBasedAccess` to enforce
 * locale-based content filtering.
 *
 * @param user - The authenticated user (Manager or API Client)
 * @param collection - Collection slug to create filter for
 *
 * @returns Boolean `true` for full access, `false` to deny all access, or a MongoDB query object to filter by locale
 *
 * @remarks
 * **Filter Logic:**
 * - Admin users: Returns `true` (no filtering, full access)
 * - Users with "all" locales permission: Returns `true` (full access)
 * - Users with specific locale permissions: Returns MongoDB filter `{ locale: { $in: ['en', 'es'] } }`
 * - Users with no permissions: Managers get default read access (`true`), API clients are denied (`false`)
 * - Inactive users: Returns `false` (no access)
 *
 * **MongoDB Integration:**
 * When a query object is returned, Payload automatically applies it as a WHERE clause:
 * ```sql
 * SELECT * FROM meditations WHERE locale IN ('en', 'es')
 * ```
 *
 * @example
 * Internal usage in permissionBasedAccess
 * ```typescript
 * read: ({ req: { user } }) => {
 *   const hasAccess = hasPermission({ operation: 'read', user, collection })
 *   if (!hasAccess) return false
 *
 *   // Apply locale filtering
 *   return createLocaleFilter(user, collection)
 * }
 * ```
 *
 * @example
 * Resulting MongoDB queries
 * ```typescript
 * // Admin user - no filter
 * createLocaleFilter(adminUser, 'pages') // Returns: true
 *
 * // User with specific locales
 * createLocaleFilter(translatorUser, 'pages') // Returns: { locale: { $in: ['en', 'fr'] } }
 *
 * // User with "all" locales
 * createLocaleFilter(managerUser, 'pages') // Returns: true
 * ```
 */
export const createLocaleFilter = (user: TypedUser | null, collection: string) => {
  if (!user?.active) return false
  // Admin users bypass all filters
  if (!isAPIClient(user) && user.admin) return true

  const permissions = user.permissions || []
  const permission = permissions.find((p) => p.allowedCollection === collection)

  // If no permission is found, only give managers access
  if (!permission) return !isAPIClient(user)
  // If user has 'all' locales permission, no filtering needed
  if (permission?.locales.includes('all')) return true

  // Create locale filter for specific locales
  // This returns a query that can be used by Payload to filter results
  return {
    or: [
      // Documents with no locale (non-localized content)
      { locale: { exists: false } },
      // Documents with permitted locales
      { locale: { in: permission.locales } },
    ],
  }
}
