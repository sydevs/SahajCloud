import { ProjectValue } from './projects'

/**
 * Helper function to create admin.hidden function based on project visibility
 *
 * Only managers can access the admin panel, so user is always TypedManager or null.
 *
 * @param allowedProjects - Array of project values where collection should be visible
 * @param options - Configuration options
 * @param options.excludeFromAdminView - If true, collection is hidden in admin view (when currentProject is null) (default: false)
 * @returns admin.hidden function
 *
 * @example
 * // Collection visible only in Web project
 * admin: {
 *   hidden: handleProjectVisibility(['wemeditate-web'])
 * }
 *
 * @example
 * // Collection visible only in specific project, excluded from admin view
 * admin: {
 *   hidden: handleProjectVisibility(['wemeditate-web'], { excludeFromAdminView: true })
 * }
 */
export function handleProjectVisibility(
  allowedProjects: ProjectValue[],
  options: { excludeFromAdminView?: boolean } = {},
) {
  const { excludeFromAdminView = false } = options

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ({ user }: { user: any }) => {
    // Get current project from user (only managers have this field)
    const currentProject = user?.currentProject

    // Handle admin view (null currentProject)
    if (!currentProject) {
      // Hide if not admin AND excludeFromAdminView is true
      // Admins can see collections in admin view unless explicitly excluded
      return user?.type !== 'admin' && excludeFromAdminView
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
