import { ProjectValue } from './projects'

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
 *   hidden: createProjectVisibility(['wemeditate-web'])
 * }
 *
 * @example
 * // Collection visible only in specific project, not in all-content mode
 * admin: {
 *   hidden: createProjectVisibility(['wemeditate-web'], { excludeAllContent: true })
 * }
 */
export function createProjectVisibility(
  allowedProjects: ProjectValue[],
  options: { excludeAllContent?: boolean } = {},
) {
  const { excludeAllContent = false } = options

  return ({ user }: { user?: any }) => {
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
export const adminOnlyVisibility = ({ user }: { user?: any }) => {
  return !user?.admin
}
