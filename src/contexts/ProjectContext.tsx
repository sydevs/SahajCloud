'use client'

import { useAuth, useRouteTransition } from '@payloadcms/ui'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import { shouldRedirectToAdmin } from '@/components/admin/ProjectSelector/utils'
import { clientLogger } from '@/lib/logger/clientLogger'
import type { ProjectSlug } from '@/payload-types'

import { resolveProject } from './resolveProject'

interface ProjectContextType {
  currentProject: ProjectSlug | null
  setCurrentProject: (project: ProjectSlug | null) => void
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined)

/**
 * Wraps the whole admin (`AdminProvider`), so a manager with a single project is
 * moved into it from any page, not only the dashboard.
 */
export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth()
  const { startRouteTransition } = useRouteTransition()
  const router = useRouter()
  const pathname = usePathname()
  const [currentProject, setCurrentProject] = useState<ProjectSlug | null>(null)
  // `useAuth` keeps the pre-save user after the refresh, so the effect would
  // otherwise persist again on its next run.
  const persisted = useRef<ProjectSlug | null>(null)

  useEffect(() => {
    if (!user) return
    const { project, persist } = resolveProject({
      type: user.type,
      roles: user.roles,
      currentProject: user.currentProject,
    })
    setCurrentProject(project)
    if (!persist || !project || persisted.current === project) return
    persisted.current = project

    // Every server-rendered part of this page — nav visibility, sidebar,
    // dashboard — read the stored project, so save it and render again.
    fetch('/api/managers/set-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ currentProject: project }),
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to set project: ${response.statusText}`)
        startRouteTransition(() =>
          shouldRedirectToAdmin(pathname, project) ? router.push('/admin') : router.refresh(),
        )
      })
      .catch((error) => clientLogger.error('Failed to auto-select project', error))
  }, [user, pathname, router, startRouteTransition])

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
