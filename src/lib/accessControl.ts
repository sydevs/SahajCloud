import { User } from '@/payload-types'
import type {
  CollectionConfig,
  Field,
  FieldBase,
  Operation,
  PayloadRequest,
  TypedUser,
} from 'payload'

const PERMISSION_LEVELS = ['read', 'translate', 'manage'] as const
type PermissionLevel = (typeof PERMISSION_LEVELS)[number]

export const PERMISSION_COLLECTIONS = ['meditations', 'music', 'frames', 'media'] as const
type PermissionCollection = (typeof PERMISSION_COLLECTIONS)[number]

type AvailableLocale = 'en' | 'cs'
type PermissionLocale = AvailableLocale | 'all'

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
  {
    label: 'English',
    value: 'en',
  },
  {
    label: 'Czech',
    value: 'cs',
  },
]

/**
 * Check if the authenticated user is an API client
 */
export const isAPIClient = (user: TypedUser | null) => {
  return user?.collection === 'clients'
}

/**
 * Check if a user has permission for a specific collection and operation
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
  locale?: AvailableLocale
}): boolean => {
  const isClient = user?.collection === 'clients'

  // Block inactive or null users
  if (!user?.active) return false
  // Admin users bypass all restrictions
  if (!isClient && (user as User).admin) return true
  // Block access to Users and Clients for non-admins
  if (collection === 'users' || collection === 'clients') return false
  // Users have read access by default
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
    // User permissions
    switch (permission.level) {
      case 'translate':
        // Translate users cannot create or delete
        if (field) {
          return field.localized && operation !== 'delete'
        } else {
          return operation === 'read' || operation === 'update'
        }
      case 'manage':
        return true // Full access for manage users
      default:
        return operation === 'read' // Default read access for users
    }
  }
}

/**
 * Create field-level access control function for use in collection field definitions
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
 * New permission-based access control for collections that should be accessible to API clients
 */
export const permissionBasedAccess = (
  collection: string,
  access: CollectionConfig['access'] = {},
): CollectionConfig['access'] => {
  return {
    ...access,
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
  }
}

/**
 * Access control for Users and Clients collections (admin only)
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
 */
export const createLocaleFilter = (user: TypedUser | null, collection: string) => {
  if (!user?.active) return false
  // Admin users bypass all filters
  if (!isAPIClient(user) && user.admin) return true

  const permissions = user.permissions || []
  const permission = permissions.find((p) => p.allowedCollection === collection)

  // If no permission is found, only give user clients access
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
