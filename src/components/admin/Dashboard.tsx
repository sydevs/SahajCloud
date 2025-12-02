import React from 'react'

import DefaultDashboard from './dashboard/DefaultDashboard'
import FathomDashboard from './dashboard/FathomDashboard'
import MetricsDashboard from './dashboard/MetricsDashboard'

// Type for props that Payload passes to dashboard views
interface DashboardProps {
  user?: {
    id?: string | number
    currentProject?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Project-Aware Dashboard Component (Server Component)
 *
 * Renders different dashboard views based on the user's currently selected project:
 * - WeMeditate Web: Fathom Analytics embed
 * - Sahaj Atlas: Fathom Analytics embed
 * - WeMeditate App: Custom metrics dashboard with collection counts
 * - All Content: Default dashboard with quick links
 */
export default function Dashboard(props: DashboardProps) {
  const currentProject = props.user?.currentProject || 'all-content'

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

    case 'all-content':
    default:
      return <DefaultDashboard />
  }
}
