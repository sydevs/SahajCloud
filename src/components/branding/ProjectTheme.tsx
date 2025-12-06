'use client'

import { useEffect } from 'react'

import { useProject } from '@/contexts/ProjectContext'
import { ProjectSlug } from '@/lib/projects'

interface ThemeColors {
  light: Record<string, string>
  dark: Record<string, string>
}

/**
 * Theme color mappings for each project
 * Uses subtle tints of brand colors for elevation variables
 * Null/undefined currentProject uses default PayloadCMS colors (no entry needed)
 */
const PROJECT_THEMES: Record<ProjectSlug, ThemeColors> = {
  'wemeditate-web': {
    // Coral/Salmon theme - warm, inviting
    light: {
      '--theme-elevation-0': '#ffffff',
      '--theme-elevation-50': '#fef5f3',
      '--theme-elevation-100': '#fce4df',
      '--theme-elevation-150': '#fad2c9',
      '--theme-elevation-200': '#f8c0b3',
      '--theme-elevation-250': '#f4a796',
      '--theme-elevation-300': '#e08e79',
      '--theme-elevation-400': '#c54d2e',
      '--theme-elevation-500': '#b44528',
      '--theme-elevation-600': '#8b3420',
      '--theme-elevation-700': '#5f2318',
      '--theme-elevation-800': '#4a1b12',
      '--theme-elevation-900': '#2d100b',
      '--theme-elevation-1000': '#000000',
    },
    dark: {
      '--theme-elevation-0': '#0a0a0a',
      '--theme-elevation-50': '#1f1412',
      '--theme-elevation-100': '#2d1916',
      '--theme-elevation-150': '#3d1f1a',
      '--theme-elevation-200': '#4d261f',
      '--theme-elevation-250': '#5f2c24',
      '--theme-elevation-300': '#72352a',
      '--theme-elevation-400': '#8b3e30',
      '--theme-elevation-500': '#a54936',
      '--theme-elevation-600': '#c0543d',
      '--theme-elevation-700': '#d86a4f',
      '--theme-elevation-800': '#e59176',
      '--theme-elevation-900': '#f0b8a3',
      '--theme-elevation-1000': '#ffffff',
    },
  },

  'wemeditate-app': {
    // Teal theme - calm, meditative
    light: {
      '--theme-elevation-0': '#ffffff',
      '--theme-elevation-50': '#ebf4f3',
      '--theme-elevation-100': '#c5e0dc',
      '--theme-elevation-150': '#a3cec9',
      '--theme-elevation-200': '#83bcb4',
      '--theme-elevation-250': '#72b3a9',
      '--theme-elevation-300': '#61aaa0',
      '--theme-elevation-400': '#4c8d84',
      '--theme-elevation-500': '#3d726b',
      '--theme-elevation-600': '#2e5652',
      '--theme-elevation-700': '#1f3a38',
      '--theme-elevation-800': '#172826',
      '--theme-elevation-900': '#0f1a19',
      '--theme-elevation-1000': '#000000',
    },
    dark: {
      '--theme-elevation-0': '#0a0a0a',
      '--theme-elevation-50': '#111a19',
      '--theme-elevation-100': '#16221f',
      '--theme-elevation-150': '#1c2b27',
      '--theme-elevation-200': '#23352f',
      '--theme-elevation-250': '#2a3f38',
      '--theme-elevation-300': '#324a41',
      '--theme-elevation-400': '#3b564b',
      '--theme-elevation-500': '#456355',
      '--theme-elevation-600': '#507160',
      '--theme-elevation-700': '#5d806c',
      '--theme-elevation-800': '#7b9e8a',
      '--theme-elevation-900': '#a3c5b5',
      '--theme-elevation-1000': '#ffffff',
    },
  },

  'sahaj-atlas': {
    // Royal Blue/Indigo theme - exploration, wisdom (increased saturation)
    light: {
      '--theme-elevation-0': '#ffffff',
      '--theme-elevation-50': '#eff3fb',
      '--theme-elevation-100': '#d6e3f5',
      '--theme-elevation-150': '#b8d0ee',
      '--theme-elevation-200': '#95bae6',
      '--theme-elevation-250': '#6fa3dd',
      '--theme-elevation-300': '#4a8cd4',
      '--theme-elevation-400': '#2d6db8',
      '--theme-elevation-500': '#245896',
      '--theme-elevation-600': '#1c4374',
      '--theme-elevation-700': '#142e52',
      '--theme-elevation-800': '#0f2440',
      '--theme-elevation-900': '#0a1829',
      '--theme-elevation-1000': '#000000',
    },
    dark: {
      '--theme-elevation-0': '#0a0a0a',
      '--theme-elevation-50': '#0f1422',
      '--theme-elevation-100': '#151d30',
      '--theme-elevation-150': '#1b263f',
      '--theme-elevation-200': '#22314f',
      '--theme-elevation-250': '#2a3d60',
      '--theme-elevation-300': '#334a72',
      '--theme-elevation-400': '#3d5885',
      '--theme-elevation-500': '#486799',
      '--theme-elevation-600': '#5578ae',
      '--theme-elevation-700': '#668ac4',
      '--theme-elevation-800': '#88a5d3',
      '--theme-elevation-900': '#b4c9e7',
      '--theme-elevation-1000': '#ffffff',
    },
  },
}

/**
 * ProjectTheme component
 * Dynamically applies project-specific theme colors by injecting CSS variables
 */
const ProjectTheme = () => {
  const { currentProject } = useProject()

  useEffect(() => {
    const theme = currentProject ? PROJECT_THEMES[currentProject] : null

    // If no theme (admin view or default), remove custom variables
    if (!theme || !currentProject) {
      document.documentElement.removeAttribute('data-project-theme')
      // Remove all custom elevation variables to restore defaults
      const root = document.documentElement
      const elevationVars = [
        '--theme-elevation-0',
        '--theme-elevation-50',
        '--theme-elevation-100',
        '--theme-elevation-150',
        '--theme-elevation-200',
        '--theme-elevation-250',
        '--theme-elevation-300',
        '--theme-elevation-400',
        '--theme-elevation-500',
        '--theme-elevation-600',
        '--theme-elevation-700',
        '--theme-elevation-800',
        '--theme-elevation-900',
        '--theme-elevation-1000',
      ]
      elevationVars.forEach((varName) => {
        root.style.removeProperty(varName)
      })
      return
    }

    // Set the project theme attribute for CSS targeting (currentProject is non-null here)
    document.documentElement.setAttribute('data-project-theme', currentProject)

    // Determine if dark mode is active
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark'

    // Apply theme colors based on mode
    const colors = isDarkMode ? theme.dark : theme.light

    const root = document.documentElement
    Object.entries(colors).forEach(([property, value]) => {
      root.style.setProperty(property, value)
    })

    // Listen for theme changes (dark/light mode toggle)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          const newIsDarkMode = document.documentElement.getAttribute('data-theme') === 'dark'
          const newColors = newIsDarkMode ? theme.dark : theme.light

          Object.entries(newColors).forEach(([property, value]) => {
            root.style.setProperty(property, value)
          })
        }
      })
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    return () => {
      observer.disconnect()
    }
  }, [currentProject])

  return null // This component doesn't render anything
}

export default ProjectTheme
