import { hasPermission } from '@/lib/accessControl'
import type { TypedClient, TypedManager } from '@/types/users'

import { ProjectSlug } from './projects'

/**
 * Helper function to create admin.hidden function based on project visibility and write permissions
 *
 * Only managers can access the admin panel, so user is always TypedManager or null.
 *
 * @param collectionSlug - Collection or global slug to check write permissions (create/update/delete/translate)
 * @param allowedProjects - Array of project values where collection should be visible
 * @param options - Configuration options
 * @param options.excludeFromAdminView - If true, collection is hidden in admin view (when currentProject is null) (default: false)
 * @returns admin.hidden function
 *
 * @example
 * // Collection visible only in Web project with write permission check
 * admin: {
 *   hidden: handleProjectVisibility('pages', ['wemeditate-web'])
 * }
 *
 * @example
 * // Collection visible only in specific project, excluded from admin view
 * admin: {
 *   hidden: handleProjectVisibility('narrators', ['wemeditate-app'], { excludeFromAdminView: true })
 * }
 */
export function handleProjectVisibility(
  collectionSlug: string,
  allowedProjects: ProjectSlug[],
  options: { excludeFromAdminView?: boolean } = {},
) {
  const { excludeFromAdminView = false } = options

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ({ user }: { user: any }) => {
    // Check write permissions (create/update/delete)
    // Note: 'update' check covers 'translate' permission (translate grants update access at collection level)
    if (user) {
      const typedUser = user as TypedManager | TypedClient
      const hasWriteAccess =
        user.type == 'admin' ||
        hasPermission({ user: typedUser, collection: collectionSlug, operation: 'create' }) ||
        hasPermission({ user: typedUser, collection: collectionSlug, operation: 'update' }) ||
        hasPermission({ user: typedUser, collection: collectionSlug, operation: 'delete' })

      if (!hasWriteAccess) return true // Hide if no write access
    }

    // Get current project from user (only managers have this field)
    const currentProject = user?.currentProject

    // Handle admin view (null currentProject)
    if (!currentProject) {
      // If excludeFromAdminView is true, hide for everyone (including admins)
      if (excludeFromAdminView) return true
      // Otherwise, only admins can see collections in admin view
      return user?.type !== 'admin'
    }

    // Check if current project is in allowed list
    return !allowedProjects.includes(currentProject)
  }
}

/**
 * Shorthand for admin-only collections (visible in all projects to admins only)
 *
 * @example
 * admin: {
 *   hidden: adminOnlyVisibility
 * }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const adminOnlyVisibility = ({ user }: { user: any }) => {
  return user?.type !== 'admin'
}
