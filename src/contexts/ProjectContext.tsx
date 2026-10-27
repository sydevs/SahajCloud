'use client'

import { toast, useAuth } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { useSwitchProject } from '@/components/admin/ProjectSelector/useSwitchProject'
import { clientLogger } from '@/lib/logger/clientLogger'
import type { ProjectSlug } from '@/payload-types'
import { resolveProject } from '@/plugins/access/config'

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
  const pathname = usePathname()
  const switchProject = useSwitchProject()
  const [currentProject, setCurrentProject] = useState<ProjectSlug | null>(null)
  // `useAuth` keeps the pre-save user after the refresh, so without this the
  // effect would save again on its next run. Cleared on failure, so the next
  // navigation retries.
  const attempted = useRef<ProjectSlug | null>(null)

  const resolved = useMemo(() => (user ? resolveProject(user) : null), [user])

  useEffect(() => {
    if (resolved) setCurrentProject(resolved.project)
  }, [resolved])

  // Separate from the effect above, so a retry on navigation never resets a
  // project the selector has switched to since.
  useEffect(() => {
    const project = resolved?.persist ? resolved.project : null
    if (!project || attempted.current === project) return
    attempted.current = project
    switchProject(project).catch((error) => {
      attempted.current = null
      clientLogger.error('Failed to open the only project', error)
      toast.error('Could not open your project. Reload the page to try again.')
    })
  }, [resolved, pathname, switchProject])

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
