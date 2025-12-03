import React from 'react'

import { MergedPermissions } from '@/types/permissions'

import DefaultDashboard from './dashboard/DefaultDashboard'
import FathomDashboard from './dashboard/FathomDashboard'
import InactiveAccountAlert from './dashboard/InactiveAccountAlert'
import MetricsDashboard from './dashboard/MetricsDashboard'
import ProjectSelectionPrompt from './dashboard/ProjectSelectionPrompt'

// Type for props that Payload passes to dashboard views
interface DashboardProps {
  user?: {
    id?: string | number
    currentProject?: string
    type?: 'inactive' | 'manager' | 'admin'
    roles?: string[] | Record<string, string[]>
    permissions?: MergedPermissions
    [key: string]: unknown
  }
  [key: string]: unknown
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
    const allowedProjects = user?.permissions?.projects || []
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
