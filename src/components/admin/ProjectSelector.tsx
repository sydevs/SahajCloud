'use client'
import { useState } from 'react'

import { useAuth } from '@payloadcms/ui'

import { useProject } from '@/contexts/ProjectContext'
import { PROJECTS, ProjectValue } from '@/lib/projects'

export const ProjectSelector = () => {
  const { currentProject, setCurrentProject } = useProject()
  const { user } = useAuth()
  const [isSaving, setIsSaving] = useState(false)

  const handleProjectChange = async (newProject: string) => {
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

      // Reload to update sidebar visibility
      window.location.reload()
    } catch (error) {
      console.error('Failed to update project:', error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      style={{
        padding: '16px',
        borderBottom: '1px solid var(--theme-elevation-100)',
        marginBottom: '8px',
      }}
    >
      <label
        style={{
          display: 'block',
          marginBottom: '8px',
          fontSize: '13px',
          fontWeight: '600',
          color: 'var(--theme-elevation-600)',
        }}
      >
        Current Project
      </label>
      <select
        value={currentProject}
        onChange={(e) => handleProjectChange(e.target.value)}
        disabled={isSaving}
        style={{
          width: '100%',
          padding: '8px 12px',
          fontSize: '14px',
          border: '1px solid var(--theme-elevation-150)',
          borderRadius: '4px',
          backgroundColor: 'var(--theme-elevation-0)',
          color: 'var(--theme-elevation-800)',
          cursor: 'pointer',
        }}
      >
        {PROJECTS.map((project) => (
          <option key={project.value} value={project.value}>
            {project.icon} {project.label}
          </option>
        ))}
      </select>
    </div>
  )
}
