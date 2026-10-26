'use client'

import { useAuth } from '@payloadcms/ui'
import { TriangleAlert } from 'lucide-react'

import { CONTACT_EMAIL } from '@/lib/contact'
import { getProjectLabel, getProjectsFromRoles } from '@/plugins/access/config'

import { CenteredNotice } from '../helpers/CenteredNotice'
import ProjectSelector from '../ProjectSelector'

/** Rendered by `DashboardView`, which decides that no project is selected. */
export default function ProjectSelectionPrompt() {
  const { user } = useAuth()
  const projects = getProjectsFromRoles(user?.roles)

  if (projects.length === 0) {
    return (
      <CenteredNotice
        fullHeight
        icon={<TriangleAlert color="var(--theme-warning-500)" aria-hidden />}
        title="No projects available"
      >
        <p>
          You don&apos;t have access to any projects yet. Ask an administrator for access at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </CenteredNotice>
    )
  }

  return (
    <CenteredNotice fullHeight title="Select a project">
      <p>
        You can work in {projects.map((project) => getProjectLabel(project)).join(', ')}. Choose one
        to get started.
      </p>
      <ProjectSelector />
    </CenteredNotice>
  )
}
