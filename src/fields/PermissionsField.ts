import type { Field } from 'payload'

import { DEFAULT_LOCALE, LocaleCode } from '@/lib/locales'
import { ProjectValue } from '@/lib/projects'
import { Manager } from '@/payload-types'
import type { MergedPermissions } from '@/types/permissions'
import type {
  ClientRole,
  ClientRoleConfig,
  ManagerRole,
  ManagerRoleConfig,
  PermissionLevel,
} from '@/types/roles'

// ============================================================================
// Manager Role Definitions
// ============================================================================

export const MANAGER_ROLES: Record<ManagerRole, ManagerRoleConfig> = {
  'meditations-editor': {
    slug: 'meditations-editor',
    label: 'Meditations Editor',
    description: 'Can create and edit meditations, upload related media and files',
    project: 'wemeditate-app',
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
    project: 'wemeditate-app',
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
    project: 'wemeditate-web',
    permissions: {
      pages: ['read', 'translate'],
      music: ['read', 'translate'],
    },
  },
}

// ============================================================================
// Client Role Definitions
// ============================================================================

export const CLIENT_ROLES: Record<ClientRole, ClientRoleConfig> = {
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
  roles: (ManagerRole | ClientRole)[],
  collectionSlug: 'clients' | 'managers',
): MergedPermissions {
  if (!roles || roles.length === 0) {
    return {}
  }

  // Select the appropriate role registry based on collection
  const roleRegistry =
    collectionSlug === 'clients'
      ? (CLIENT_ROLES as Record<string, ClientRoleConfig>)
      : (MANAGER_ROLES as Record<string, ManagerRoleConfig>)

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

      // Get the array for this collection (cast to PermissionLevel[] since we're building collection permissions)
      const collectionPerms = merged[collection] as PermissionLevel[]

      // Add operations that aren't already present (union)
      operations.forEach((op) => {
        if (!collectionPerms.includes(op)) {
          collectionPerms.push(op)
        }
      })
    })
  })

  return merged
}

/**
 * INTERNAL: Compute all projects a manager has access to based on their roles
 *
 * This function is used internally by the virtual permissions field's afterRead hook
 * to cache allowed projects in user.permissions.projects. Consumers should use the
 * cached user.permissions.projects field instead of calling this function directly.
 *
 * Checks roles across ALL locales and returns unique projects (union approach)
 *
 * @internal
 * @param manager - Manager document with roles field
 * @returns Array of unique ProjectValue the manager can access
 */
function computeAllowedProjects(manager: {
  roles?: ManagerRole[] | Record<LocaleCode, ManagerRole[]>
  type?: Manager['type']
}): ProjectValue[] {
  // Admins have access to all projects (via null/admin view)
  if (manager.type === 'admin' || !manager.roles) {
    return []
  }

  // Extract all role slugs from all locales
  const allRoleSlugs = Array.isArray(manager.roles)
    ? manager.roles
    : Object.values(manager.roles).flat()

  // Map roles to projects and get unique values
  const projects = allRoleSlugs
    .map((roleSlug) => MANAGER_ROLES[roleSlug]?.project)
    .filter((project): project is ProjectValue => project !== undefined)

  return [...new Set(projects)]
}

// ============================================================================
// Field Factories
// ============================================================================

/**
 * Create permissions-related fields for Managers collection
 *
 * Returns an array of 4 fields:
 * 1. type - Manager access level (inactive, manager, admin) with toggle button group
 * 2. roles - Localized multi-select of manager roles (hidden if type is not 'manager')
 * 3. customResourceAccess - Polymorphic relationship for document-level permissions (hidden if type is not 'manager')
 * 4. permissions - Virtual field showing merged permissions (hidden)
 *
 * @returns Array of Payload field configurations
 */
export function ManagerPermissionsField(): Field[] {
  const roleOptions = Object.values<ManagerRoleConfig>(MANAGER_ROLES).map((role) => ({
    label: role.label,
    value: role.slug,
  }))

  return [
    // 1. Type field (segmented control for access level)
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'manager',
      options: [
        { label: 'Inactive', value: 'inactive' },
        { label: 'Manager', value: 'manager' },
        { label: 'Admin', value: 'admin' },
      ],
      admin: {
        description:
          "Set the manager's access level. Admin grants full access, Manager uses role-based permissions, Inactive blocks all access.",
        components: {
          Field: '@/components/admin/ToggleGroupField',
        },
      },
    },

    // 2. Roles field (localized multi-select)
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      localized: true,
      // Not required - managers can have only customResourceAccess without roles
      options: roleOptions,
      admin: {
        description:
          'Assign roles for each locale. Different roles can be assigned for different languages.',
        condition: (data) => data.type === 'manager',
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
        condition: (data) => data.type === 'manager',
      },
    },

    // 4. Virtual permissions field - IMPORTANT: This provides automatic permission caching!
    // When managers are fetched from the database, this afterRead hook populates the
    // `permissions` field with computed permissions for the current locale AND a
    // `projects` key with allowed projects (union across all locales).
    // The access control system (accessControl.ts) checks for this field and uses it
    // if present, only computing on-demand if missing. This provides efficient caching
    // without requiring separate cache management.
    // The computation is locale-aware for permissions and cross-locale for projects.
    // Structure: { meditations: ['read'], media: ['create'], projects: ['wemeditate-app'] }
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
              return { projects: [] }
            }

            // Extract locale-specific roles array for permissions
            let roleSlugArray: ManagerRole[]
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

            // Compute permissions for current locale
            const permissions = mergeRolePermissions(roleSlugArray, 'managers')

            // Compute allowed projects (union across all locales)
            const projects = computeAllowedProjects({
              roles: data.roles,
              type: data.type,
            })

            // Return flat object with collection permissions + projects array
            return {
              ...permissions,
              projects,
            }
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
  const roleOptions = Object.values<ClientRoleConfig>(CLIENT_ROLES).map((role) => ({
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

    // 2. Virtual permissions field - IMPORTANT: This provides automatic permission caching!
    // When clients are fetched from the database, this afterRead hook populates the
    // `permissions` field with computed permissions. The access control system checks
    // for this field and uses it if present, only computing on-demand if missing.
    // This provides efficient caching without requiring separate cache management.
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
