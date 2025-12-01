/**
 * Centralized project configuration for the application.
 * This is the single source of truth for all supported projects.
 */

export const PROJECTS = [
  {
    value: 'wemeditate-web',
    label: 'WeMeditate Web',
    icon: '🌐',
  },
  {
    value: 'wemeditate-app',
    label: 'WeMeditate App',
    icon: '📱',
  },
  {
    value: 'sahaj-atlas',
    label: 'Sahaj Atlas',
    icon: '🗺️',
  },
] as const

/**
 * TypeScript type for project values
 */
export type ProjectValue = (typeof PROJECTS)[number]['value']

/**
 * Default project for the application
 */
export const DEFAULT_PROJECT: ProjectValue = 'wemeditate-web'

/**
 * Get project label by value
 */
export function getProjectLabel(value: ProjectValue): string {
  const project = PROJECTS.find((p) => p.value === value)
  return project?.label || value
}

/**
 * Get project icon by value
 */
export function getProjectIcon(value: ProjectValue): string {
  const project = PROJECTS.find((p) => p.value === value)
  return project?.icon || '📦'
}

/**
 * Get project select options for Payload fields
 */
export function getProjectOptions() {
  return PROJECTS.map(({ value, label }) => ({ value, label }))
}

/**
 * Validate if a string is a valid project value
 */
export function isValidProject(value: string): value is ProjectValue {
  return PROJECTS.some((p) => p.value === value)
}
