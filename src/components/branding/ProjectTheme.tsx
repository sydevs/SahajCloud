'use client'

import { useEffect } from 'react'

import { useProject } from '@/contexts/ProjectContext'
import { ELEVATION_STEPS, PROJECT_THEMES } from '@/lib/branding'

const ELEVATION_VARS = ELEVATION_STEPS.map((step) => `--theme-elevation-${step}`)

/**
 * Paints the current project's elevation scale onto the document, and follows
 * Payload's own dark-mode switch. No project means Payload's default greys.
 */
const ProjectTheme = () => {
  const { currentProject } = useProject()

  useEffect(() => {
    const root = document.documentElement
    const theme = currentProject ? PROJECT_THEMES[currentProject] : null

    if (!theme || !currentProject) {
      root.removeAttribute('data-project-theme')
      ELEVATION_VARS.forEach((varName) => root.style.removeProperty(varName))
      return
    }

    root.setAttribute('data-project-theme', currentProject)

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
