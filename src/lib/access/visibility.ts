/**
 * Visibility Functions for Access Plugin
 *
 * Generates admin.hidden functions for collections and globals
 * based on project configuration and user permissions.
 */

import type { createPermissionChecker } from './permissions'
import type { ProjectLookup, TypedManager } from './types'
import type { CollectionConfig, GlobalConfig } from 'payload'

import type { ProjectSlug } from '@/lib/projects'

import { hasPermission } from './accessControl'
import { hasWritePermission } from './permissions'

/**
 * User object type for visibility checks
 *
 * PayloadCMS passes user objects from either Managers or Clients collection.
 * We use this minimal interface for type-safe property access.
 */
interface VisibilityUser {
  type?: 'inactive' | 'manager' | 'admin'
  currentProject?: string | null
}

/**
 * Create admin.hidden function for a collection
 *
 * Visibility logic:
 * 1. If user has no write permission for collection, hide it (unless admin)
 * 2. If collection is not in any project, show to all (implicitly shared)
 * 3. If user's current project is null (admin view), show to admins only
 * 4. If user's current project matches one of the allowed projects, show it
 * 5. Otherwise, hide it
 *
 * @param projectLookup - Pre-computed project lookup table
 * @param hasPermission - Permission checker function
 * @param collectionSlug - Collection slug
 * @returns Hidden function for admin.hidden
 */
export function createCollectionHiddenFunction(
  projectLookup: ProjectLookup,
  hasPermission: ReturnType<typeof createPermissionChecker>,
  collectionSlug: string,
): NonNullable<CollectionConfig['admin']>['hidden'] {
  // Get projects that include this collection (may be empty = implicitly shared)
  const allowedProjects = projectLookup.collections.get(collectionSlug)

  // Return function compatible with PayloadCMS's hidden type
  return ({ user }: { user: unknown }) => {
    // No user = hide
    if (!user) return true

    // Cast to our visibility user type for property access
    const visibilityUser = user as VisibilityUser

    // Check if user is admin
    const isAdmin = visibilityUser.type === 'admin'

    // 1. Check write permissions (unless admin)
    if (!isAdmin) {
      // Cast to TypedManager for permission checking (only managers access admin UI)
      const hasWrite = hasWritePermission(hasPermission, user as TypedManager, collectionSlug)
      if (!hasWrite) return true // Hide if no write permission
    }

    // 2. Collection not in any project = implicitly shared (visible to all)
    if (!allowedProjects || allowedProjects.size === 0) {
      // For implicitly shared collections, show to users with write access (checked above)
      // or show to admins
      return false
    }

    // 3. Admin view (null currentProject) - show to admins only
    const currentProject = visibilityUser.currentProject
    if (!currentProject) {
      return !isAdmin
    }

    // 4 & 5. Check if current project matches allowed projects
    return !allowedProjects.has(currentProject)
  }
}

/**
 * Create admin.hidden function for a global
 *
 * Same logic as collection hidden function.
 *
 * @param projectLookup - Pre-computed project lookup table
 * @param hasPermission - Permission checker function
 * @param globalSlug - Global slug
 * @returns Hidden function for admin.hidden
 */
export function createGlobalHiddenFunction(
  projectLookup: ProjectLookup,
  hasPermission: ReturnType<typeof createPermissionChecker>,
  globalSlug: string,
): NonNullable<GlobalConfig['admin']>['hidden'] {
  // Get projects that include this global (may be empty = implicitly shared)
  const allowedProjects = projectLookup.globals.get(globalSlug)

  // Return function compatible with PayloadCMS's hidden type
  return ({ user }: { user: unknown }) => {
    // No user = hide
    if (!user) return true

    // Cast to our visibility user type for property access
    const visibilityUser = user as VisibilityUser

    // Check if user is admin
    const isAdmin = visibilityUser.type === 'admin'

    // 1. Check write permissions (unless admin)
    if (!isAdmin) {
      // Cast to TypedManager for permission checking (only managers access admin UI)
      const hasWrite = hasWritePermission(hasPermission, user as TypedManager, globalSlug)
      if (!hasWrite) return true // Hide if no write permission
    }

    // 2. Global not in any project = implicitly shared (visible to all)
    if (!allowedProjects || allowedProjects.size === 0) {
      return false
    }

    // 3. Admin view (null currentProject) - show to admins only
    const currentProject = visibilityUser.currentProject
    if (!currentProject) {
      return !isAdmin
    }

    // 4 & 5. Check if current project matches allowed projects
    return !allowedProjects.has(currentProject)
  }
}

/**
 * Admin-only visibility shorthand
 *
 * Returns true (hidden) for non-admin users.
 * Useful for system collections like Managers, Clients.
 */
export const adminOnlyHidden: NonNullable<CollectionConfig['admin']>['hidden'] = ({
  user,
}: {
  user: unknown
}) => {
  if (!user) return true
  return (user as VisibilityUser).type !== 'admin'
}

// ============================================================================
// Backward Compatibility Functions
// ============================================================================

/**
 * Helper function to create admin.hidden function based on project visibility and write permissions
 *
 * This is a standalone function that doesn't require plugin lookup tables.
 * Use this for plugin-generated collections (like formBuilderPlugin) that need
 * manual visibility configuration.
 *
 * @param collectionSlug - Collection or global slug to check write permissions
 * @param allowedProjects - Array of project values where collection should be visible
 * @param options - Configuration options
 * @param options.excludeFromAdminView - If true, collection is hidden in admin view (default: false)
 * @returns admin.hidden function
 *
 * @example
 * // Collection visible only in Web project
 * admin: {
 *   hidden: handleProjectVisibility('forms', ['wemeditate-web'])
 * }
 */
export function handleProjectVisibility(
  collectionSlug: string,
  allowedProjects: ProjectSlug[],
  options: { excludeFromAdminView?: boolean } = {},
): NonNullable<CollectionConfig['admin']>['hidden'] {
  const { excludeFromAdminView = false } = options

  return ({ user }: { user: unknown }) => {
    if (!user) return true

    const typedUser = user as TypedManager

    // Check write permissions (create/update/delete)
    // Note: 'update' check covers 'translate' permission (translate grants update access at collection level)
    const isAdmin = typedUser.type === 'admin'
    if (!isAdmin) {
      const hasWriteAccess =
        hasPermission({ user: typedUser, collection: collectionSlug, operation: 'create' }) ||
        hasPermission({ user: typedUser, collection: collectionSlug, operation: 'update' }) ||
        hasPermission({ user: typedUser, collection: collectionSlug, operation: 'delete' })

      if (!hasWriteAccess) return true // Hide if no write access
    }

    // Get current project from user
    const currentProject = typedUser.currentProject

    // Handle admin view (null currentProject)
    if (!currentProject) {
      // If excludeFromAdminView is true, hide for everyone (including admins)
      if (excludeFromAdminView) return true
      // Otherwise, only admins can see collections in admin view
      return !isAdmin
    }

    // Check if current project is in allowed list
    return !allowedProjects.includes(currentProject as ProjectSlug)
  }
}
