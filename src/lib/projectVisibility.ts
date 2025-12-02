import type { TypedUser } from 'payload'

import { ProjectValue } from './projects'

/**
 * Extended user type for admin.hidden functions
 * Includes currentProject field which exists on managers
 */
interface AdminUser extends TypedUser {
  currentProject?: string
  admin?: boolean
}

/**
 * Helper function to create admin.hidden function based on project visibility
 *
 * @param allowedProjects - Array of project values where collection should be visible
 * @param options - Configuration options
 * @param options.excludeAllContent - If true, collection is hidden in "all-content" mode (default: false)
 * @returns admin.hidden function
 *
 * @example
 * // Collection visible only in Web project
 * admin: {
 *   hidden: handleProjectVisibility(['wemeditate-web'])
 * }
 *
 * @example
 * // Collection visible only in specific project, not in all-content mode
 * admin: {
 *   hidden: handleProjectVisibility(['wemeditate-web'], { excludeAllContent: true })
 * }
 */
export function handleProjectVisibility(
  allowedProjects: ProjectValue[],
  options: { excludeAllContent?: boolean } = {},
) {
  const { excludeAllContent = false } = options

  return ({ user }: { user?: AdminUser }) => {
    // Get current project from user
    const currentProject = user?.currentProject as ProjectValue | undefined

    // Handle "all-content" mode
    if (currentProject === 'all-content') {
      // If excludeAllContent is true, hide in all-content mode
      return excludeAllContent
    }

    // Check if current project is in allowed list
    return !currentProject || !allowedProjects.includes(currentProject)
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
export const adminOnlyVisibility = ({ user }: { user?: AdminUser }) => {
  return user?.admin !== true
}
