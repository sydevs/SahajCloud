'use client'

import { useEffect } from 'react'

import { useProject } from '@/contexts/ProjectContext'
import { ELEVATION_STEPS, PROJECT_THEMES, elevationVar } from '@/lib/branding'

/**
 * Paints the current project's elevation scale onto the document, and follows
 * Payload's own dark-mode switch. No project means Payload's default greys.
 */
const ProjectTheme = () => {
  const { currentProject } = useProject()

  useEffect(() => {
    const root = document.documentElement

    if (!currentProject) {
      root.removeAttribute('data-project-theme')
      ELEVATION_STEPS.forEach((step) => root.style.removeProperty(elevationVar(step)))
      return
    }

    root.setAttribute('data-project-theme', currentProject)
    const theme = PROJECT_THEMES[currentProject]

    const paint = () => {
      const colors = root.getAttribute('data-theme') === 'dark' ? theme.dark : theme.light
      Object.entries(colors).forEach(([property, value]) => root.style.setProperty(property, value))
    }

    paint()

    const observer = new MutationObserver(paint)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      observer.disconnect()
    }
  }, [currentProject])

  return null
}

export default ProjectTheme
