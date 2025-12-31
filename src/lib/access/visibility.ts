/**
 * Visibility Functions for Access Plugin
 *
 * Generates admin.hidden functions for collections and globals
 * based on project configuration and user permissions.
 */

import type { createPermissionChecker } from './permissions'
import type { ProjectLookup, TypedManager } from './types'
import type { CollectionConfig, GlobalConfig } from 'payload'

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
 * 1. If user has no write permission for collection, hide it
 * 2. If collection is not in any project, show (implicitly shared)
 * 3. If user's current project is null (admin view), show
 * 4. If user's current project matches one of the allowed projects, show it
 * 5. Otherwise, hide it
 *
 * Note: Admin access is handled by the bypass function which grants write
 * permission to admins, so no explicit admin checks needed here.
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

    // 1. Check write permissions (bypass grants admins access)
    const hasWrite = hasWritePermission(hasPermission, user as TypedManager, collectionSlug)
    if (!hasWrite) return true // Hide if no write permission

    // 2. Collection not in any project = implicitly shared (visible to all with write access)
    if (!allowedProjects || allowedProjects.size === 0) {
      return false
    }

    // 3. Admin view (null currentProject) - show to users with write access
    const visibilityUser = user as VisibilityUser
    const currentProject = visibilityUser.currentProject
    if (!currentProject) {
      return false // Write permission already verified above
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

    // 1. Check write permissions (bypass grants admins access)
    const hasWrite = hasWritePermission(hasPermission, user as TypedManager, globalSlug)
    if (!hasWrite) return true // Hide if no write permission

    // 2. Global not in any project = implicitly shared (visible to all with write access)
    if (!allowedProjects || allowedProjects.size === 0) {
      return false
    }

    // 3. Admin view (null currentProject) - show to users with write access
    const visibilityUser = user as VisibilityUser
    const currentProject = visibilityUser.currentProject
    if (!currentProject) {
      return false // Write permission already verified above
    }

    // 4 & 5. Check if current project matches allowed projects
    return !allowedProjects.has(currentProject)
  }
}

