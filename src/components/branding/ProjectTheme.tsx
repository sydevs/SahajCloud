'use client'

import { useEffect } from 'react'

import { useProject } from '@/contexts/ProjectContext'
import {
  ACCENT_VARS,
  ELEVATION_STEPS,
  PROJECT_ACCENTS,
  PROJECT_THEMES,
  SUCCESS_SCALE,
  elevationVar,
} from '@/lib/branding'

/**
 * Paints the admin's palette onto the document, and follows Payload's own
 * dark-mode switch: the success scale, which is one green under every project,
 * and the current project's elevation scale and accent. No project means
 * Payload's default greys, and a chosen control back on Payload's own pair.
 */
const ProjectTheme = () => {
  const { currentProject } = useProject()

  useEffect(() => {
    const root = document.documentElement
    const theme = currentProject ? PROJECT_THEMES[currentProject] : null

    if (currentProject) {
      root.setAttribute('data-project-theme', currentProject)
      const accent = PROJECT_ACCENTS[currentProject]
      root.style.setProperty(ACCENT_VARS.fill, accent.fill)
      root.style.setProperty(ACCENT_VARS.text, accent.text)
    } else {
      root.removeAttribute('data-project-theme')
      ELEVATION_STEPS.forEach((step) => root.style.removeProperty(elevationVar(step)))
      Object.values(ACCENT_VARS).forEach((property) => root.style.removeProperty(property))
    }

    const paint = () => {
      const dark = root.getAttribute('data-theme') === 'dark'
      const scales = [dark ? SUCCESS_SCALE.dark : SUCCESS_SCALE.light]
      if (theme) scales.push(dark ? theme.dark : theme.light)
      scales.forEach((scale) =>
        Object.entries(scale).forEach(([property, value]) =>
          root.style.setProperty(property, value),
        ),
      )
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
