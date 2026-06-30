/**
 * Role Configuration
 *
 * This module contains role configuration, computed lookup tables,
 * and helper functions for role-related access control.
 *
 * Contents:
 * - ROLES constant (internal)
 * - TRANSLATABLE_COLLECTIONS lookup (internal)
 * - Role helper functions (exported)
 */

import type { ContentSlug, PermissionLevel } from '../types'
import type { CollectionSlug } from 'payload'

import {
  getAllProjectCollections,
  isCollectionVisibleInProject,
  type InternalProjectSlug,
} from './projects'

// =============================================================================
// Internal Configuration (NOT exported - use helper functions)
// =============================================================================

/**
 * Role Configuration
 * All roles in a flat structure (manager roles + client roles with -client suffix).
 */
const ROLES = {
  // Manager roles
  'meditations-editor': {
    label: 'Meditations Editor',
    description: 'Can create and edit meditations, upload related media and files',
    project: 'wemeditate-app' as const,
    permissions: {
      meditations: ['update', 'create'] as PermissionLevel[],
      narrators: ['update', 'create'] as PermissionLevel[],
      'user-choices': ['update'] as PermissionLevel[],
      images: ['create'] as PermissionLevel[],
      files: ['create'] as PermissionLevel[],
    },
  },
  'path-editor': {
    label: 'Path Editor',
    description: 'Can edit lessons and lectures; upload related media and files',
    project: 'wemeditate-app' as const,
    permissions: {
      lessons: ['update'] as PermissionLevel[],
      lectures: ['update', 'create'] as PermissionLevel[],
      images: ['create'] as PermissionLevel[],
      files: ['create'] as PermissionLevel[],
    },
  },
  'web-translator': {
    label: 'Web Translator',
    description: 'Can edit localized fields in pages, songs, and albums',
    project: 'wemeditate-web' as const,
    permissions: {
      pages: ['translate'] as PermissionLevel[],
      songs: ['translate'] as PermissionLevel[],
      albums: ['translate'] as PermissionLevel[],
    },
  },
  'atlas-manager': {
    label: 'Atlas Manager',
    description: 'Can manage events and regions within their own regions for Sahaj Atlas',
    project: 'sahaj-atlas' as const,
    // Read comes implicitly from project membership. These create/update/delete
    // grants are *scoped to the manager's owned-region subtree* in the access
    // layer (regionSubtreeAccess.ts) — they are NOT collection-wide despite
    // appearing here. Regions get create+update; events also get delete (trash).
    permissions: {
      regions: ['create', 'update'] as PermissionLevel[],
      events: ['create', 'update', 'delete'] as PermissionLevel[],
    },
  },

  // Client roles (renamed with -client suffix)
  'wemeditate-web-client': {
    label: 'We Meditate Web',
    description: 'Access for We Meditate web frontend application',
    project: 'wemeditate-web' as const,
    permissions: {
      // All collections/globals get implicit read via project parameter
      // Only explicit permissions needed for non-read operations
      'form-submissions': ['create'] as PermissionLevel[],
    },
  },
  'wemeditate-app-client': {
    label: 'We Meditate App',
    description: 'Access for We Meditate mobile application',
    project: 'wemeditate-app' as const,
    // All collections/globals get implicit read via project parameter
    // No explicit permissions needed
    permissions: {},
  },
  'sahaj-atlas-client': {
    label: 'Sahaj Atlas',
    description: 'Access for Sahaj Atlas application',
    project: 'sahaj-atlas' as const,
    // All collections/globals get implicit read via project parameter
    // No explicit permissions needed
    permissions: {},
  },
} as const

// =============================================================================
// Internal Type Alias
// =============================================================================

/** Role slug type derived from ROLES constant */
type InternalRoleSlug = keyof typeof ROLES

// =============================================================================
// Computed Lookup Tables (internal only, computed at module load)
// =============================================================================

/**
 * Collections that have at least one role with translate permission
 * Computed once at module load from ROLES configuration
 * Used to determine if field-level access should be applied
 */
const TRANSLATABLE_COLLECTIONS: Set<CollectionSlug> = (() => {
  const collections = new Set<CollectionSlug>()
  Object.values(ROLES).forEach((roleConfig) => {
    Object.entries(roleConfig.permissions).forEach(([collection, permissions]) => {
      if (permissions.includes('translate' as PermissionLevel)) {
        collections.add(collection as CollectionSlug)
      }
    })
  })
  return collections
})()

// =============================================================================
// Type Generation Helper
// =============================================================================

/**
 * Get array of role slugs for TypeScript type generation
 * @returns Array of role slugs
 */
export function getRoleSlugs(): InternalRoleSlug[] {
  return Object.keys(ROLES) as InternalRoleSlug[]
}

// =============================================================================
// Role Helper Functions
// =============================================================================

/**
 * Get the project associated with a role
 * @param role - Role slug
 * @returns Project slug or undefined
 */
export function getRoleProject(role: InternalRoleSlug): InternalProjectSlug | undefined {
  const roleConfig = ROLES[role]
  return roleConfig?.project
}

/**
 * Get permissions for a single role (explicit only, no implicit reads)
 *
 * Used by PermissionsTable component and permission checking logic.
 *
 * @param role - Role slug
 * @returns Permissions object mapping collection slugs to permission levels
 */
export function getPermissionsForRole(role: InternalRoleSlug) {
  const roleConfig = ROLES[role]
  return (roleConfig?.permissions || {}) as Record<ContentSlug, PermissionLevel[]>
}

/**
 * Get role options filtered by allowed roles
 * @param allowedRoles - Array of role slugs to include
 * @returns Array of role options with value and label
 * @throws Error if any role slug is invalid
 */
export function getRoleOptions(allowedRoles: InternalRoleSlug[]) {
  return allowedRoles.map((roleSlug) => {
    const roleConfig = ROLES[roleSlug]
    if (!roleConfig) {
      throw new Error(
        `Invalid role slug: "${roleSlug}". Valid roles are: ${Object.keys(ROLES).join(', ')}`,
      )
    }
    return { label: roleConfig.label, value: roleSlug }
  })
}

/**
 * Check if a collection has any role with translate permission
 * Used to determine if field-level access should be applied
 * @param collection - Collection slug
 * @returns True if collection has translate permissions
 */
export function isTranslatableCollection(collection: CollectionSlug): boolean {
  return TRANSLATABLE_COLLECTIONS.has(collection)
}

/**
 * Extract projects from a user's roles
 *
 * Handles both localized (managers) and flat array (clients) role formats.
 * Used by ProjectSelector and ProjectContext to determine allowed projects.
 *
 * @param roles - Roles in either format (localized Record or flat array)
 * @returns Array of unique project slugs
 */
export function getProjectsFromRoles(
  roles: InternalRoleSlug[] | Record<string, InternalRoleSlug[]> | undefined | null,
): InternalProjectSlug[] {
  if (!roles) return []

  // Flatten roles if localized (Record<locale, roles[]>)
  const allRoles: InternalRoleSlug[] = Array.isArray(roles)
    ? roles
    : (Object.values(roles).flat() as InternalRoleSlug[])

  // Map to projects and deduplicate
  const projects = new Set<InternalProjectSlug>()
  for (const role of allRoles) {
    const project = getRoleProject(role)
    if (project) projects.add(project)
  }

  return Array.from(projects)
}

/**
 * Get all collections with implicit read access for given roles
 *
 * This is a higher-level function that builds on isCollectionVisibleInProject.
 * For each role, it finds the associated project and adds all collections visible in that project.
 *
 * Includes:
 * - Project collections (collections in the role's project)
 * - Shared collections (collections not in any project, visible to all)
 *
 * @param roles - Array of role slugs
 * @returns Array of collection slugs readable by these roles
 */
export function getReadableCollections(roles: InternalRoleSlug[]): ContentSlug[] {
  const collections = new Set<ContentSlug>()

  // Get all collections visible for each role's project
  for (const role of roles) {
    const project = getRoleProject(role)
    // Use isCollectionVisibleInProject to check each collection
    // This ensures we use the same visibility logic everywhere
    getAllProjectCollections().forEach((collection) => {
      if (isCollectionVisibleInProject(collection, project || null)) {
        collections.add(collection)
      }
    })
  }

  return Array.from(collections).sort() as ContentSlug[]
}
