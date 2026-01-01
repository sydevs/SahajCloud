import { getRoleProject } from '@/lib/access'
import type { Manager, ProjectSlug } from '@/payload-types'

import DefaultDashboard from './DefaultDashboard'
import FathomDashboard from './FathomDashboard'
import InactiveAccountAlert from './InactiveAccountAlert'
import MetricsDashboard from './MetricsDashboard'
import ProjectSelectionPrompt from './ProjectSelectionPrompt'

// Type for props that Payload passes to dashboard views
interface DashboardProps {
  user?: {
    id?: string | number
    currentProject?: ProjectSlug
    type?: Manager['type']
    roles?: string[] | Record<string, string[]>
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Extract all unique projects from a user's roles
 * Handles both flat array and localized object formats
 */
function getAllowedProjects(roles?: string[] | Record<string, string[]>): ProjectSlug[] {
  if (!roles) return []

  // Collect all role slugs from all locales
  const allRoleSlugs: string[] = []

  if (Array.isArray(roles)) {
    // Flat array format
    allRoleSlugs.push(...roles)
  } else {
    // Localized object format - collect roles from all locales
    Object.values(roles).forEach((localeRoles) => {
      if (Array.isArray(localeRoles)) {
        allRoleSlugs.push(...localeRoles)
      }
    })
  }

  // Extract unique projects from all roles
  const projects = new Set<ProjectSlug>()
  allRoleSlugs.forEach((roleSlug) => {
    const project = getRoleProject(roleSlug) as ProjectSlug | undefined
    if (project) {
      projects.add(project)
    }
  })

  return Array.from(projects)
}

/**
 * Project-Aware Dashboard Component (Server Component)
 *
 * Renders different dashboard views based on the user's currently selected project:
 * - null (no project selected):
 *   - Inactive managers: Show account disabled alert
 *   - Admin managers: Show default dashboard (admin view)
 *   - Regular managers: Show project selector (ProjectProvider handles auto-select)
 * - wemeditate-web: Fathom Analytics embed
 * - wemeditate-app: Custom metrics dashboard with collection counts
 * - sahaj-atlas: Fathom Analytics embed
 */
export default function Dashboard(props: DashboardProps) {
  const currentProject = props.user?.currentProject
  const user = props.user

  // Handle null/undefined currentProject (no project selected)
  if (!currentProject) {
    // Case 1: Inactive account
    if (user?.type === 'inactive') {
      return <InactiveAccountAlert />
    }

    // Case 2: Admin users see default dashboard (admin view)
    if (user?.type === 'admin') {
      return <DefaultDashboard />
    }

    // Case 3: Regular managers - show project selector
    // ProjectProvider handles auto-selection for single-project managers
    const allowedProjects = getAllowedProjects(user?.roles)
    return <ProjectSelectionPrompt allowedProjects={allowedProjects} />
  }

  // Render project-specific dashboard
  switch (currentProject) {
    case 'wemeditate-web':
      return (
        <FathomDashboard
          siteId="pfpcdamq"
          siteName="we+meditate"
          title="We Meditate Web Analytics"
        />
      )

    case 'sahaj-atlas':
      return (
        <FathomDashboard siteId="qqwctiuv" siteName="sahaj+atlas" title="Sahaj Atlas Analytics" />
      )

    case 'wemeditate-app':
      return <MetricsDashboard />

    default:
      return <DefaultDashboard />
  }
}
