import type { CollectionSlug, Field, GlobalSlug } from 'payload'

import { LOCALES, LocaleCode } from '@/lib/locales'

// ============================================================================
// Type Definitions
// ============================================================================

export type ManagerRole = 'meditations-editor' | 'path-editor' | 'translator' | 'admin'
export type ClientRole = 'we-meditate-web' | 'we-meditate-app' | 'sahaj-atlas'

export type PermissionLevel = 'read' | 'create' | 'update' | 'delete' | 'translate'

export interface RolePermission {
  collection: CollectionSlug | GlobalSlug
  operations: PermissionLevel[]
}

export interface RoleConfig {
  slug: string
  label: string
  description: string
  permissions: RolePermission[]
}

export interface MergedPermissions {
  [collection: string]: {
    operations: PermissionLevel[]
  }
}

// ============================================================================
// Manager Role Definitions
// ============================================================================

export const MANAGER_ROLES: Record<ManagerRole, RoleConfig> = {
  'meditations-editor': {
    slug: 'meditations-editor',
    label: 'Meditations Editor',
    description: 'Can create and edit meditations, upload related media and files',
    permissions: [
      { collection: 'meditations', operations: ['read', 'create', 'update'] },
      { collection: 'media', operations: ['read', 'create'] },
      { collection: 'file-attachments', operations: ['read', 'create'] },
    ],
  },
  'path-editor': {
    slug: 'path-editor',
    label: 'Path Editor',
    description: 'Can edit lessons and external videos, upload related media and files',
    permissions: [
      { collection: 'lessons', operations: ['read', 'update'] },
      { collection: 'external-videos', operations: ['read', 'update'] },
      { collection: 'media', operations: ['read', 'create'] },
      { collection: 'file-attachments', operations: ['read', 'create'] },
    ],
  },
  translator: {
    slug: 'translator',
    label: 'Translator',
    description: 'Can edit localized fields in pages and music',
    permissions: [
      { collection: 'pages', operations: ['read', 'translate'] },
      { collection: 'music', operations: ['read', 'translate'] },
    ],
  },
  admin: {
    slug: 'admin',
    label: 'Admin',
    description: 'Full access to all collections and features including system collections',
    permissions: [
      // Admin has access to ALL collections - this is handled specially in access control logic
      // We list key collections here for documentation purposes
      { collection: 'managers', operations: ['read', 'create', 'update', 'delete'] },
      { collection: 'clients', operations: ['read', 'create', 'update', 'delete'] },
      { collection: 'form-submissions', operations: ['read', 'create', 'update', 'delete'] },
      { collection: 'payload-jobs', operations: ['read', 'create', 'update', 'delete'] },
    ],
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
    permissions: [
      { collection: 'we-meditate-web-settings', operations: ['read'] },
      { collection: 'meditations', operations: ['read'] },
      { collection: 'frames', operations: ['read'] },
      { collection: 'narrators', operations: ['read'] },
      { collection: 'media', operations: ['read'] },
      { collection: 'file-attachments', operations: ['read'] },
      { collection: 'pages', operations: ['read'] },
      { collection: 'music', operations: ['read'] },
      { collection: 'forms', operations: ['read'] },
      { collection: 'authors', operations: ['read'] },
      { collection: 'meditation-tags', operations: ['read'] },
      { collection: 'page-tags', operations: ['read'] },
      { collection: 'music-tags', operations: ['read'] },
      { collection: 'form-submissions', operations: ['create'] },
    ],
  },
  'we-meditate-app': {
    slug: 'we-meditate-app',
    label: 'We Meditate App',
    description: 'Access for We Meditate mobile application',
    permissions: [
      { collection: 'we-meditate-app-settings', operations: ['read'] },
      { collection: 'meditations', operations: ['read'] },
      { collection: 'frames', operations: ['read'] },
      { collection: 'narrators', operations: ['read'] },
      { collection: 'lessons', operations: ['read'] },
      { collection: 'external-videos', operations: ['read'] },
      { collection: 'music', operations: ['read'] },
      { collection: 'media', operations: ['read'] },
      { collection: 'file-attachments', operations: ['read'] },
      { collection: 'meditation-tags', operations: ['read'] },
      { collection: 'page-tags', operations: ['read'] },
      { collection: 'music-tags', operations: ['read'] },
    ],
  },
  'sahaj-atlas': {
    slug: 'sahaj-atlas',
    label: 'Sahaj Atlas',
    description: 'Access for Sahaj Atlas application',
    permissions: [
      { collection: 'sahaj-atlas-settings', operations: ['read'] },
      { collection: 'media', operations: ['read'] },
      { collection: 'file-attachments', operations: ['read'] },
    ],
  },
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Merge permissions from multiple roles for a specific locale
 *
 * For managers: Roles are locale-specific, so we only merge roles for the given locale
 * For clients: Roles are not locale-specific, so locale parameter is ignored
 *
 * @param roles - Array of role slugs or object with locale keys
 * @param locale - The locale to merge permissions for (only used for managers)
 * @param isClient - Whether this is for a client (roles not localized)
 * @returns Merged permissions object
 */
export function mergeRolePermissions(
  roles: string[] | Record<LocaleCode, string[]> | undefined,
  locale?: LocaleCode,
  isClient = false,
): MergedPermissions {
  if (!roles) return {}

  // Get the role slugs for the current locale
  let roleSlugArray: string[]
  if (isClient) {
    // Clients: roles is a simple array
    roleSlugArray = Array.isArray(roles) ? roles : []
  } else {
    // Managers: roles is an object with locale keys
    if (Array.isArray(roles)) {
      roleSlugArray = roles
    } else if (locale && roles[locale]) {
      roleSlugArray = roles[locale]
    } else {
      roleSlugArray = []
    }
  }

  const merged: MergedPermissions = {}

  // Merge permissions from all roles
  roleSlugArray.forEach((roleSlug) => {
    // Look up role in the appropriate registry
    const role = isClient
      ? CLIENT_ROLES[roleSlug as ClientRole]
      : MANAGER_ROLES[roleSlug as ManagerRole]

    if (!role) return

    role.permissions.forEach((perm) => {
      const collection = perm.collection as string
      if (!merged[collection]) {
        merged[collection] = { operations: [] }
      }

      // Add operations that aren't already present (union)
      perm.operations.forEach((op) => {
        if (!merged[collection].operations.includes(op)) {
          merged[collection].operations.push(op)
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

  return collectionPerms.operations.includes(operation)
}

// ============================================================================
// Field Factory
// ============================================================================

/**
 * Create permissions-related fields for Managers or Clients collections
 *
 * Returns an array of 3 fields:
 * 1. roles - Localized array for managers, simple array for clients
 * 2. customResourceAccess - Polymorphic relationship (managers only)
 * 3. permissions - Virtual field showing merged permissions
 *
 * @param options - Configuration options
 * @returns Array of Payload field configurations
 */
export function PermissionsField(options: { type: 'manager' | 'client' }): Field[] {
  const isManager = options.type === 'manager'
  const roleRegistry = isManager ? MANAGER_ROLES : CLIENT_ROLES

  // Convert role registry to select options
  const roleOptions = Object.values(roleRegistry).map((role) => ({
    label: role.label,
    value: role.slug,
  }))

  const fields: Field[] = []

  // 1. Roles field
  if (isManager) {
    // Managers: Localized array of role selections
    fields.push({
      name: 'roles',
      type: 'array',
      localized: true,
      admin: {
        description:
          'Assign roles for each locale. Different roles can be assigned for different languages.',
        condition: (data) => {
          // Hide if user has admin role in any locale
          if (!data.roles) return true

          // Handle both array format (current locale) and Record format (all locales)
          if (Array.isArray(data.roles)) {
            return !data.roles.some((r: { role: string }) => r.role === 'admin')
          } else {
            const roles = data.roles as Record<LocaleCode, Array<{ role: string }>>
            return !Object.values(roles).some((localeRoles) =>
              Array.isArray(localeRoles) && localeRoles.some((r) => r.role === 'admin'),
            )
          }
        },
      },
      fields: [
        {
          name: 'role',
          type: 'select',
          required: true,
          options: roleOptions,
        },
      ],
    })
  } else {
    // Clients: Simple array of role selections (not localized)
    fields.push({
      name: 'roles',
      type: 'array',
      admin: {
        description: 'Assign API client roles. Roles apply to all locales.',
      },
      fields: [
        {
          name: 'role',
          type: 'select',
          required: true,
          options: roleOptions,
        },
      ],
    })
  }

  // 2. Custom Resource Access (managers only)
  if (isManager) {
    fields.push({
      name: 'customResourceAccess',
      type: 'relationship',
      relationTo: ['pages'],
      hasMany: true,
      admin: {
        description:
          'Grant update access to specific documents. Useful for giving access to individual pages without broader permissions.',
        condition: (data) => {
          // Hide if user has admin role in any locale
          if (!data.roles) return true

          // Handle both array format (current locale) and Record format (all locales)
          if (Array.isArray(data.roles)) {
            return !data.roles.some((r: { role: string }) => r.role === 'admin')
          } else {
            const roles = data.roles as Record<LocaleCode, Array<{ role: string }>>
            return !Object.values(roles).some((localeRoles) =>
              Array.isArray(localeRoles) && localeRoles.some((r) => r.role === 'admin'),
            )
          }
        },
      },
    })
  }

  // 3. Virtual permissions field
  fields.push({
    name: 'permissions',
    type: 'json',
    virtual: true,
    admin: {
      readOnly: true,
      description: isManager
        ? 'Computed permissions for the current locale based on assigned roles'
        : 'Computed permissions based on assigned roles (applies to all locales)',
      components: {
        Field: '@/components/admin/PermissionsTable',
      },
    },
    hooks: {
      afterRead: [
        async ({ data, req }) => {
          if (!data?.roles) return {}

          const locale = req.locale as LocaleCode

          // Extract role slugs from array format
          let roleArray = data.roles
          if (Array.isArray(roleArray) && roleArray.length > 0 && typeof roleArray[0] === 'object') {
            // Convert from array of objects to array of strings
            roleArray = roleArray.map((r: Record<string, string>) => r.role)
          }

          // Merge permissions for current locale
          return mergeRolePermissions(roleArray, locale, !isManager)
        },
      ],
    },
  })

  return fields
}
