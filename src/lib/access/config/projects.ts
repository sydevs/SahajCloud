/**
 * Project Configuration
 *
 * This module contains project configuration, computed lookup tables,
 * and helper functions for project-related access control and UI.
 *
 * Contents:
 * - PROJECTS constant (internal)
 * - Admin view constants (internal)
 * - Computed lookup tables (internal)
 * - Project helper functions (exported)
 */

import type { ContentSlug } from '../types'
import type { CollectionSlug } from 'payload'

// =============================================================================
// Internal Configuration (NOT exported - use helper functions)
// =============================================================================

/**
 * Project Configuration
 * Merged structure including UI metadata and access control
 */
const PROJECTS = {
  'wemeditate-web': {
    label: 'WeMeditate Web',
    icon: '/images/wemeditate-web.svg',
    collections: [
      'pages',
      'meditations',
      'songs',
      'albums',
      'videos',
      'forms',
      'form-submissions',
      'authors',
      'meditation-tags',
      'song-tags',
      'narrators',
      'frames',
      'images',
      'files',
    ],
    globals: ['we-meditate-web-settings'],
  },
  'wemeditate-app': {
    label: 'WeMeditate App',
    icon: '/images/wemeditate-app.svg',
    collections: [
      'meditations',
      'songs',
      'albums',
      'videos',
      'lessons',
      'lectures',
      'frames',
      'narrators',
      'meditation-tags',
      'song-tags',
      'images',
      'files',
    ],
    globals: ['we-meditate-app-settings'],
  },
  'sahaj-atlas': {
    label: 'Sahaj Atlas',
    icon: '/images/sahaj-atlas.webp',
    collections: ['images', 'files'],
    globals: ['sahaj-atlas-settings'],
  },
} as const

/**
 * Admin view constants (for null project handling)
 */
const ADMIN_VIEW_LABEL = 'Sahaj Cloud'
const ADMIN_VIEW_ICON = '/images/sahaj-cloud.svg'

// =============================================================================
// Type Export (for use by roles.ts)
// =============================================================================

/** Project slug type derived from PROJECTS constant */
export type InternalProjectSlug = keyof typeof PROJECTS

// =============================================================================
// Computed Lookup Tables (internal only, computed at module load)
// =============================================================================

/**
 * Project to collections mapping (includes globals)
 * Computed once at module load from PROJECTS configuration
 */
const PROJECT_TO_COLLECTIONS: Record<InternalProjectSlug, ContentSlug[]> = Object.entries(
  PROJECTS,
).reduce(
  (acc, [projectSlug, projectConfig]) => {
    acc[projectSlug as InternalProjectSlug] = [
      ...projectConfig.collections,
      ...projectConfig.globals,
    ] as ContentSlug[]
    return acc
  },
  {} as Record<InternalProjectSlug, ContentSlug[]>,
)

/**
 * Reverse lookup: collection -> projects that include it
 * Computed from PROJECT_TO_COLLECTIONS
 */
const COLLECTION_TO_PROJECTS: Record<ContentSlug, InternalProjectSlug[]> = (
  Object.entries(PROJECT_TO_COLLECTIONS) as [InternalProjectSlug, CollectionSlug[]][]
).reduce(
  (acc, [project, collections]) => {
    collections.forEach((collection) => {
      if (!acc[collection]) acc[collection] = []
      acc[collection].push(project)
    })
    return acc
  },
  {} as Record<ContentSlug, InternalProjectSlug[]>,
)

/**
 * All collections across all projects (union)
 * Computed once at module load for O(1) access
 * Used by OpenAPI spec filter when no specific project is selected
 */
const ALL_PROJECT_COLLECTIONS: ContentSlug[] = (() => {
  const allCollections = new Set<ContentSlug>()
  Object.values(PROJECT_TO_COLLECTIONS).forEach((collections) => {
    collections.forEach((c) => allCollections.add(c))
  })
  return Array.from(allCollections)
})()

// =============================================================================
// Type Generation Helper
// =============================================================================

/**
 * Get array of project slugs for TypeScript type generation
 * @returns Array of project slugs
 */
export function getProjectSlugs(): InternalProjectSlug[] {
  return Object.keys(PROJECTS) as InternalProjectSlug[]
}

// =============================================================================
// UI/Branding Functions
// =============================================================================

/**
 * Get icon path for a project (or default for admin view)
 * @param project - Project slug or null for admin view
 * @returns Icon file path
 */
export function getProjectIcon(project: InternalProjectSlug | null): string {
  if (!project) return ADMIN_VIEW_ICON
  const projectConfig = PROJECTS[project]
  return projectConfig?.icon || ADMIN_VIEW_ICON
}

/**
 * Get human-readable label for a project
 * @param project - Project slug or null for admin view
 * @returns Human-readable project label
 */
export function getProjectLabel(project: InternalProjectSlug | null): string {
  if (!project) return ADMIN_VIEW_LABEL
  const projectConfig = PROJECTS[project]
  return projectConfig?.label || project
}

/**
 * Get project select options for Payload fields and UI selectors
 * @returns Array of project options with value and label
 */
export function getProjectOptions(): Array<{ value: InternalProjectSlug; label: string }> {
  return (
    Object.entries(PROJECTS) as [InternalProjectSlug, (typeof PROJECTS)[InternalProjectSlug]][]
  ).map(([value, config]) => ({
    value,
    label: config.label,
  }))
}

/**
 * Validate if a value is a valid project slug
 * @param value - Value to validate
 * @returns True if value is a valid project slug or null
 */
export function isValidProject(value: string | null): boolean {
  return value === null || value in PROJECTS
}

// =============================================================================
// Access Control Functions
// =============================================================================

/**
 * Get collections available in a project (includes globals)
 * @param project - Project slug
 * @returns Array of collection/global slugs
 */
export function getProjectCollections(project: InternalProjectSlug): ContentSlug[] {
  return PROJECT_TO_COLLECTIONS[project] || []
}

/**
 * Get all collections across all projects (union)
 * @returns Pre-computed array of all collection slugs from all projects
 */
export function getAllProjectCollections(): ContentSlug[] {
  return ALL_PROJECT_COLLECTIONS
}

/**
 * Check if collection should be visible for a given project context
 *
 * Used for both permission checking (implicit read) and admin UI visibility.
 * Handles special cases:
 * - Collections not in any project (shared) are visible to all
 * - Admin view (null) sees all collections
 * - Regular projects only see their assigned collections
 *
 * @param collection - Collection slug
 * @param currentProject - Project slug or null for admin view
 * @returns True if collection should be visible
 */
export function isCollectionVisibleInProject(
  collection: ContentSlug,
  currentProject: InternalProjectSlug | null,
) {
  const allowedProjects = COLLECTION_TO_PROJECTS[collection]

  // Not in any project → visible to all (shared collection)
  if (!allowedProjects || allowedProjects.length === 0) return true

  // Admin view (null) → visible to all
  if (currentProject === null) return true

  // Check if current project includes this collection
  return allowedProjects.includes(currentProject)
}
