'use client'

import { useAuth } from '@payloadcms/ui'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

import { ProjectValue } from '@/lib/projects'

interface ProjectContextType {
  currentProject: ProjectValue | null
  setCurrentProject: (project: ProjectValue | null) => void
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth()
  const [currentProject, setCurrentProject] = useState<ProjectValue | null>(null)

  // Validate current project and auto-select if needed
  useEffect(() => {
    if (!user) return

    // Get allowed projects from cached permissions field
    const allowedProjects = (user.permissions?.projects as ProjectValue[]) || []
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

      // Update database with auto-selected project
      fetch(`/api/managers/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentProject: selected }),
      }).catch((error) => {
        console.error('Failed to auto-select project:', error)
      })
      return
    }

    // Case 4: Multiple projects or invalid current - require manual selection
    setCurrentProject(null)
  }, [user, user?.id, user?.permissions?.projects, user?.currentProject, user?.type])

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
