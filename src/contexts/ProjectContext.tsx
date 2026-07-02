'use client'

import { useAuth } from '@payloadcms/ui'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

import type { ProjectSlug } from '@/payload-types'
import { getProjectsFromRoles } from '@/plugins/access'

interface ProjectContextType {
  currentProject: ProjectSlug | null
  setCurrentProject: (project: ProjectSlug | null) => void
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth()
  const [currentProject, setCurrentProject] = useState<ProjectSlug | null>(null)

  // Validate current project and auto-select if needed
  useEffect(() => {
    if (!user) return

    // Compute allowed projects from user's roles
    const allowedProjects = getProjectsFromRoles(user.roles) as ProjectSlug[]
    const current = user.currentProject

    // Case 1: Admin with no project selected - use null (admin view)
    if (user.type === 'admin' && !current) {
      setCurrentProject(null)
      return
    }

    // Case 2: Current project is valid - keep it
    if (current && (user.type === 'admin' || allowedProjects.includes(current))) {
      setCurrentProject(current)
      return
    }

    // Case 3: Auto-select if only one project available
    if (user.type !== 'admin' && allowedProjects.length === 1) {
      const selected = allowedProjects[0]
      setCurrentProject(selected)

      // Persist the auto-selected project via the lightweight self-only endpoint.
      fetch('/api/managers/set-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentProject: selected }),
      }).catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Failed to auto-select project:', error)
      })
      return
    }

    // Case 4: Multiple projects or invalid current - require manual selection
    setCurrentProject(null)
  }, [user, user?.id, user?.roles, user?.currentProject, user?.type])

  return (
    <ProjectContext.Provider value={{ currentProject, setCurrentProject }}>
      {children}
    </ProjectContext.Provider>
  )
}

export const useProject = () => {
  const context = useContext(ProjectContext)
  if (!context) {
    throw new Error('useProject must be used within ProjectProvider')
  }
  return context
}
