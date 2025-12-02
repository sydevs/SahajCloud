'use client'

import { ReactSelect, useAuth, useRouteTransition } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useProject } from '@/contexts/ProjectContext'
import { PROJECTS, ProjectValue } from '@/lib/projects'

// Define Option type for ReactSelect
interface SelectOption {
  value: string
  label: string
  [key: string]: string // Index signature required by ReactSelect
}

// Convert PROJECTS to SelectOption format for ReactSelect (label only)
const projectOptions: SelectOption[] = PROJECTS.map((project) => ({
  value: project.value,
  label: project.label,
}))

const ProjectSelector = () => {
  const { currentProject, setCurrentProject } = useProject()
  const { user } = useAuth()
  const { startRouteTransition } = useRouteTransition()
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)

  const handleProjectChange = async (option: unknown) => {
    // Handle single option (not multi-select)
    if (Array.isArray(option)) return

    const selectedOption = option as SelectOption
    const newProject = selectedOption.value

    setIsSaving(true)
    try {
      // Update manager profile
      await fetch(`/api/managers/${user?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentProject: newProject }),
      })

      // Update local state
      setCurrentProject(newProject as ProjectValue)

      // Redirect to admin root to avoid viewing hidden collections
      startRouteTransition(() => router.push('/admin'))
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to update project:', error)
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
