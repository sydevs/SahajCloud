'use client'

import { useProject } from '@/contexts/ProjectContext'
import { getProjectLabel } from '@/lib/projects'

import Icon from './Icon'

const LOGO_SIZE = 48 // Standardized logo size

/**
 * Inline Logo component for Payload admin panel
 * Displays project-specific logo with title horizontally on login/signup pages
 */
const InlineLogo = () => {
  const { currentProject } = useProject()
  const projectLabel = getProjectLabel(currentProject)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <Icon size={LOGO_SIZE} alt={projectLabel} style={{ borderRadius: '25%' }} />
      <span
        style={{
          fontSize: '18px',
          fontWeight: 'bold',
          color: 'var(--theme-elevation-800)',
        }}
      >
        {projectLabel}
      </span>
    </div>
  )
}

export default InlineLogo
