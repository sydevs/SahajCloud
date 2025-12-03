'use client'

import { ReactSelect, toast, useAuth, useRouteTransition } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { useProject } from '@/contexts/ProjectContext'
import { logger } from '@/lib/logger'
import { ADMIN_PROJECT_LABEL, PROJECTS, ProjectValue } from '@/lib/projects'

// Define Option type for ReactSelect
interface SelectOption {
  value: ProjectValue | null
  label: string
  [key: string]: string | null // Index signature required by ReactSelect
}

const ProjectSelector = () => {
  const { currentProject, setCurrentProject } = useProject()
  const { user } = useAuth()
  const { startRouteTransition } = useRouteTransition()
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)

  // Calculate allowed projects and available options
  const projectOptions = useMemo(() => {
    const options: SelectOption[] = []

    // Admins get "All Content" option first (maps to null)
    if (user?.type === 'admin') {
      options.push({
        value: null,
        label: ADMIN_PROJECT_LABEL,
      })
    }

    // Get allowed projects from cached permissions field
    const allowedProjects = user?.type === 'admin'
      ? PROJECTS.map((p) => p.value) // Admins see all projects
      : ((user?.permissions?.projects as ProjectValue[]) || [])

    // Add projects the user has access to
    allowedProjects.forEach((projectValue) => {
      const projectConfig = PROJECTS.find((p) => p.value === projectValue)
      if (projectConfig) {
        options.push({
          value: projectConfig.value,
          label: projectConfig.label,
        })
      }
    })

    return options
  }, [user?.type, user?.permissions?.projects])

  const handleProjectChange = async (option: unknown) => {
    // Handle single option (not multi-select)
    if (Array.isArray(option)) return

    const selectedOption = option as SelectOption
    const newProject = selectedOption.value
    const previousProject = currentProject

    setIsSaving(true)
    try {
      // Update manager profile
      const response = await fetch(`/api/managers/${user?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentProject: newProject }),
      })

      if (!response.ok) {
        throw new Error(`Failed to update project: ${response.statusText}`)
      }

      // Update local state
      setCurrentProject(newProject)

      // Redirect to admin root to avoid viewing hidden collections
      startRouteTransition(() => router.push('/admin'))
    } catch (error) {
      logger.error('Failed to update project:', error)
      toast.error('Failed to change project. Please try again.')
      // Revert to previous project
      setCurrentProject(previousProject)
    } finally {
      setIsSaving(false)
    }
  }

  // Find the current option
  const selectedOption = projectOptions.find((opt) => opt.value === currentProject)

  return (
    <div
      style={{
        paddingBottom: 'calc(var(--base) * 0.8)',
        borderBottom: '1px solid var(--theme-elevation-100)',
        marginBottom: 'var(--base)',
        width: '100%',
      }}
    >
      <label
        style={{
          display: 'block',
          marginBottom: 'calc(var(--base) * 0.4)',
          fontSize: 'calc(var(--base-body-size) * 1px)',
          fontWeight: '600',
          color: 'var(--theme-elevation-600)',
        }}
      >
        Current Project
      </label>
      <ReactSelect
        options={projectOptions}
        value={selectedOption}
        onChange={handleProjectChange}
        disabled={isSaving}
        isClearable={false}
        isSearchable={false}
      />
    </div>
  )
}

export default ProjectSelector
