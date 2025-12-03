/**
 * Centralized project configuration for the application.
 * This is the single source of truth for all supported projects.
 */

export const PROJECTS = [
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
 * Note: null represents admin view (previously 'all-content')
 */
export type ProjectSlug = (typeof PROJECTS)[number]['value']

/**
 * Label for admin view (when currentProject is null)
 */
export const ADMIN_PROJECT_LABEL = 'All Content'

/**
 * Project-specific icon paths
 * Uses 'sahaj-cloud' as fallback key for admin view
 */
export const PROJECT_ICONS: Record<ProjectSlug | 'sahaj-cloud', string> = {
  'sahaj-cloud': '/images/sahaj-cloud.svg',
  'wemeditate-web': '/images/wemeditate-web.svg',
  'wemeditate-app': '/images/wemeditate-app.svg',
  'sahaj-atlas': '/images/sahaj-atlas.webp',
}

/**
 * Get project label by value
 * @param value - Project value or null
 * @returns Human-readable project label
 */
export function getProjectLabel(value: ProjectSlug | null): string {
  if (value === null) {
    return ADMIN_PROJECT_LABEL
  }
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
 * Validate if a value is a valid project value
 * @param value - Value to validate
 * @returns True if value is a valid ProjectSlug or null
 */
export function isValidProject(value: string | null): value is ProjectSlug | null {
  return value === null || PROJECTS.some((p) => p.value === value)
}
