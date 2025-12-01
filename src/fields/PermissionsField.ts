import type { Field } from 'payload'

import { DEFAULT_LOCALE, LocaleCode } from '@/lib/locales'

// ============================================================================
// Type Definitions
// ============================================================================

export type ManagerRole = 'meditations-editor' | 'path-editor' | 'translator'
export type ClientRole = 'we-meditate-web' | 'we-meditate-app' | 'sahaj-atlas'

export type PermissionLevel = 'read' | 'create' | 'update' | 'delete' | 'translate'

export interface RoleConfig {
  slug: string
  label: string
  description: string
  permissions: {
    [collection: string]: PermissionLevel[]
  }
}

export type MergedPermissions = {
  [collection: string]: PermissionLevel[]
}

// ============================================================================
// Manager Role Definitions
// ============================================================================

export const MANAGER_ROLES: Record<ManagerRole, RoleConfig> = {
  'meditations-editor': {
    slug: 'meditations-editor',
    label: 'Meditations Editor',
    description: 'Can create and edit meditations, upload related media and files',
    permissions: {
      meditations: ['read', 'create', 'update'],
      media: ['read', 'create'],
      'file-attachments': ['read', 'create'],
    },
  },
  'path-editor': {
    slug: 'path-editor',
    label: 'Path Editor',
    description: 'Can edit lessons and external videos, upload related media and files',
    permissions: {
      lessons: ['read', 'update'],
      'external-videos': ['read', 'update'],
      media: ['read', 'create'],
      'file-attachments': ['read', 'create'],
    },
  },
  translator: {
    slug: 'translator',
    label: 'Translator',
    description: 'Can edit localized fields in pages and music',
    permissions: {
      pages: ['read', 'translate'],
      music: ['read', 'translate'],
    },
  },
}

// ============================================================================
// Client Role Definitions
// ============================================================================

export const CLIENT_ROLES: Record<ClientRole, RoleConfig> = {
  'we-meditate-web': {
    slug: 'we-meditate-web',
    label: 'We Meditate Web',
    description: 'Access for We Meditate web frontend application',
    permissions: {
      'we-meditate-web-settings': ['read'],
      meditations: ['read'],
      frames: ['read'],
      narrators: ['read'],
      media: ['read'],
      'file-attachments': ['read'],
      pages: ['read'],
      music: ['read'],
      forms: ['read'],
      authors: ['read'],
      'meditation-tags': ['read'],
      'page-tags': ['read'],
      'music-tags': ['read'],
      'form-submissions': ['create'],
    },
  },
  'we-meditate-app': {
    slug: 'we-meditate-app',
    label: 'We Meditate App',
    description: 'Access for We Meditate mobile application',
    permissions: {
      'we-meditate-app-settings': ['read'],
      meditations: ['read'],
      frames: ['read'],
      narrators: ['read'],
      lessons: ['read'],
      'external-videos': ['read'],
      music: ['read'],
      media: ['read'],
      'file-attachments': ['read'],
      'meditation-tags': ['read'],
      'page-tags': ['read'],
      'music-tags': ['read'],
    },
  },
  'sahaj-atlas': {
    slug: 'sahaj-atlas',
    label: 'Sahaj Atlas',
    description: 'Access for Sahaj Atlas application',
    permissions: {
      'sahaj-atlas-settings': ['read'],
      media: ['read'],
      'file-attachments': ['read'],
    },
  },
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Merge permissions from multiple roles
 *
 * @param roles - Array of role slugs to merge
 * @param collectionSlug - Collection slug ('clients' or 'managers') to determine role registry
 * @returns Merged permissions object
 */
export function mergeRolePermissions(
  roles: string[],
  collectionSlug: 'clients' | 'managers',
): MergedPermissions {
  if (!roles || roles.length === 0) {
    return {}
  }

  // Select the appropriate role registry based on collection
  const roleRegistry =
    collectionSlug === 'clients'
      ? (CLIENT_ROLES as Record<string, RoleConfig>)
      : (MANAGER_ROLES as Record<string, RoleConfig>)

  const merged: MergedPermissions = {}

  // Merge permissions from all roles
  roles.forEach((roleSlug) => {
    const role = roleRegistry[roleSlug]

    if (!role) {
      return
    }

    // Iterate through each collection in the role's permissions
    Object.entries(role.permissions).forEach(([collection, operations]) => {
      if (!merged[collection]) {
        merged[collection] = []
      }

      // Add operations that aren't already present (union)
      operations.forEach((op) => {
        if (!merged[collection].includes(op)) {
          merged[collection].push(op)
        }
      })
    })
  })

  return merged
}

/**
 * Check if a user has a specific role permission
 *
 * @param user - The user object with permissions field
 * @param collection - Collection slug to check
 * @param operation - Operation to check
 * @returns Whether the user has the permission
 */
export function hasRolePermission(
  user: { permissions?: MergedPermissions } | null,
  collection: string,
  operation: PermissionLevel,
): boolean {
  if (!user?.permissions) return false

  const collectionPerms = user.permissions[collection]
  if (!collectionPerms) return false

  return collectionPerms.includes(operation)
}

// ============================================================================
// Field Factories
// ============================================================================

/**
 * Create permissions-related fields for Managers collection
 *
 * Returns an array of 4 fields:
 * 1. admin - Boolean for full system access
 * 2. roles - Localized multi-select of manager roles (hidden if admin is true)
 * 3. customResourceAccess - Polymorphic relationship for document-level permissions (hidden if admin is true)
 * 4. permissions - Virtual field showing merged permissions (hidden if admin is true)
 *
 * @returns Array of Payload field configurations
 */
export function ManagerPermissionsField(): Field[] {
  const roleOptions = Object.values(MANAGER_ROLES).map((role) => ({
    label: role.label,
    value: role.slug,
  }))

  return [
    // 1. Admin boolean field
    {
      name: 'admin',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description:
          'Grant full administrative access to all collections and features. When enabled, role-based permissions are bypassed.',
      },
    },

    // 2. Roles field (localized multi-select)
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      localized: true,
      options: roleOptions,
      admin: {
        description:
          'Assign roles for each locale. Different roles can be assigned for different languages.',
        condition: (data) => !data.admin,
        components: {
          afterInput: ['@/components/admin/PermissionsTable'],
        },
      },
    },

    // 3. Custom Resource Access
    {
      name: 'customResourceAccess',
      type: 'relationship',
      relationTo: ['pages'],
      hasMany: true,
      admin: {
        description:
          'Grant update access to specific documents. Useful for giving access to individual pages without broader permissions.',
        condition: (data) => !data.admin,
      },
    },

    // 4. Virtual permissions field (hidden - kept for potential future use)
    {
      name: 'permissions',
      type: 'json',
      virtual: true,
      admin: {
        hidden: true,
      },
      hooks: {
        afterRead: [
          async ({ data, req }) => {
            if (!data?.roles) {
              return {}
            }

            // Extract locale-specific roles array
            let roleSlugArray: string[]
            if (Array.isArray(data.roles)) {
              // PayloadCMS has already localized the data
              roleSlugArray = data.roles
            } else if (typeof data.roles === 'object') {
              // Full localized object - extract for current locale
              const locale = (req.locale as LocaleCode) || DEFAULT_LOCALE
              roleSlugArray = data.roles[locale] || []
            } else {
              roleSlugArray = []
            }

            return mergeRolePermissions(roleSlugArray, 'managers')
          },
        ],
      },
    },
  ]
}

/**
 * Create permissions-related fields for Clients collection
 *
 * Returns an array of 2 fields:
 * 1. roles - Non-localized multi-select of client roles
 * 2. permissions - Virtual field showing merged permissions
 *
 * @returns Array of Payload field configurations
 */
export function ClientPermissionsField(): Field[] {
  const roleOptions = Object.values(CLIENT_ROLES).map((role) => ({
    label: role.label,
    value: role.slug,
  }))

  return [
    // 1. Roles field (non-localized multi-select)
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      options: roleOptions,
      admin: {
        description: 'Assign API client roles. Roles apply to all locales.',
        components: {
          afterInput: ['@/components/admin/PermissionsTable'],
        },
      },
    },

    // 2. Virtual permissions field (hidden - kept for potential future use)
    {
      name: 'permissions',
      type: 'json',
      virtual: true,
      admin: {
        hidden: true,
      },
      hooks: {
        afterRead: [
          async ({ data }) => {
            if (!data?.roles) return {}

            // Roles are just an array of strings for clients (not localized)
            return mergeRolePermissions(data.roles, 'clients')
          },
        ],
      },
    },
  ]
}
