'use client'

import { useProject } from '@/contexts/ProjectContext'
import { getProjectLabel } from '@/lib/projects'

import Icon from './Icon'

const LOGO_SIZE = 64 // Larger logo size for stacked layout

/**
 * Stacked Logo component for Payload admin panel
 * Displays project-specific logo with title centered below
 */
const Logo = () => {
  const { currentProject } = useProject()
  const projectLabel = getProjectLabel(currentProject)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      <Icon size={LOGO_SIZE} alt={projectLabel} />
      <span
        style={{
          fontSize: '20px',
          fontWeight: 'bold',
          color: 'var(--theme-elevation-800)',
        }}
      >
        {projectLabel}
      </span>
    </div>
  )
}

export default Logo
