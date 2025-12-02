'use client'

import { useAuth } from '@payloadcms/ui'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

import { ProjectValue, DEFAULT_PROJECT } from '@/lib/projects'

interface ProjectContextType {
  currentProject: ProjectValue
  setCurrentProject: (project: ProjectValue) => void
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth()
  const [currentProject, setCurrentProject] = useState<ProjectValue>(() => {
    return (user?.currentProject as ProjectValue) || DEFAULT_PROJECT
  })

  // Sync with user profile changes
  useEffect(() => {
    if (user?.currentProject) {
      setCurrentProject(user.currentProject as ProjectValue)
    }
  }, [user?.currentProject])

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
