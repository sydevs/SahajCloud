/**
 * Centralized project configuration for the application.
 * This is the single source of truth for all supported projects.
 */

export const PROJECTS = [
  {
    value: 'all-content',
    label: 'All Content',
  },
  {
    value: 'wemeditate-web',
    label: 'WeMeditate Web',
  },
  {
    value: 'wemeditate-app',
    label: 'WeMeditate App',
  },
  {
    value: 'sahaj-atlas',
    label: 'Sahaj Atlas',
  },
] as const

/**
 * TypeScript type for project values
 */
export type ProjectValue = (typeof PROJECTS)[number]['value']

/**
 * Default project for the application
 */
export const DEFAULT_PROJECT: ProjectValue = 'all-content'

/**
 * Get project label by value
 */
export function getProjectLabel(value: ProjectValue): string {
  const project = PROJECTS.find((p) => p.value === value)
  return project?.label || value
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
