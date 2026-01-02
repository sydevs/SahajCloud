/**
 * Access Control Configuration
 *
 * Single source of truth for projects, roles, and access control data.
 * All configuration is internal - external access only via helper functions.
 *
 * This consolidates:
 * - Project configuration (from src/lib/projects.ts)
 * - Role configuration (existing)
 * - Lookup tables and helper functions (from src/lib/access/data.ts)
 */

import type { CollectionSlug } from 'payload'
import type { PermissionLevel } from './types'

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
      'music',
      'albums',
      'forms',
      'form-submissions',
      'authors',
      'page-tags',
      'meditation-tags',
      'music-tags',
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
      'music',
      'albums',
      'lessons',
      'lectures',
      'frames',
      'narrators',
      'meditation-tags',
      'music-tags',
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
 * Role Configuration
 * All roles in a flat structure (manager roles + client roles with -client suffix).
 */
const ROLES = {
  // Manager roles
  'meditations-editor': {
    label: 'Meditations Editor',
    description: 'Can create and edit meditations, upload related media and files',
    project: 'wemeditate-app' as const,
    permissions: {
      meditations: ['create', 'update'] as PermissionLevel[],
      narrators: ['create', 'update'] as PermissionLevel[],
      images: ['create'] as PermissionLevel[],
      files: ['create'] as PermissionLevel[],
    },
  },
  'path-editor': {
    label: 'Path Editor',
    description: 'Can edit lessons and lectures, upload related media and files',
    project: 'wemeditate-app' as const,
    permissions: {
      lessons: ['update'] as PermissionLevel[],
      lectures: ['update'] as PermissionLevel[],
      images: ['create'] as PermissionLevel[],
      files: ['create'] as PermissionLevel[],
    },
  },
  translator: {
    label: 'Translator',
    description: 'Can edit localized fields in pages, music, and albums',
    project: 'wemeditate-web' as const,
    permissions: {
      pages: ['translate'] as PermissionLevel[],
      music: ['translate'] as PermissionLevel[],
      albums: ['translate'] as PermissionLevel[],
    },
  },

  // Client roles (renamed with -client suffix)
  'wemeditate-web-client': {
    label: 'We Meditate Web',
    description: 'Access for We Meditate web frontend application',
    project: 'wemeditate-web' as const,
    permissions: {
      // All collections/globals get implicit read via project parameter
      // Only explicit permissions needed for non-read operations
      'form-submissions': ['create'] as PermissionLevel[],
    },
  },
  'wemeditate-app-client': {
    label: 'We Meditate App',
    description: 'Access for We Meditate mobile application',
    project: 'wemeditate-app' as const,
    permissions: {
      // All collections/globals get implicit read via project parameter
      // Only explicit permissions needed for non-project collections
      'page-tags': ['read'] as PermissionLevel[], // Not in wemeditate-app project
    },
  },
  'sahaj-atlas-client': {
    label: 'Sahaj Atlas',
    description: 'Access for Sahaj Atlas application',
    project: 'sahaj-atlas' as const,
    // All collections/globals get implicit read via project parameter
    // No explicit permissions needed
    permissions: {},
  },
} as const

/**
 * Admin view constants (for null project handling)
 */
const ADMIN_VIEW_LABEL = 'Sahaj Cloud'
const ADMIN_VIEW_ICON = '/images/sahaj-cloud.svg'

// =============================================================================
// Computed Lookup Tables (internal only, computed at module load)
// =============================================================================

/**
 * Collections that have at least one role with translate permission
 * Computed once at module load from ROLES configuration
 * Used to determine if field-level access should be applied
 */
const TRANSLATABLE_COLLECTIONS: Set<string> = (() => {
  const collections = new Set<string>()
  Object.values(ROLES).forEach((roleConfig) => {
    Object.entries(roleConfig.permissions).forEach(([collection, permissions]) => {
      if (permissions.includes('translate' as PermissionLevel)) {
        collections.add(collection)
      }
    })
  })
  return collections
})()

/**
 * Project to collections mapping (includes globals)
 * Computed once at module load from PROJECTS configuration
 */
const PROJECT_TO_COLLECTIONS: Record<string, CollectionSlug[]> = Object.entries(PROJECTS).reduce(
  (acc, [projectSlug, projectConfig]) => {
    acc[projectSlug] = [...projectConfig.collections, ...projectConfig.globals] as CollectionSlug[]
    return acc
  },
  {} as Record<string, CollectionSlug[]>,
)

/**
 * Reverse lookup: collection -> projects that include it
 * Computed from PROJECT_TO_COLLECTIONS
 */
const COLLECTION_TO_PROJECTS: Record<string, string[]> = Object.entries(
  PROJECT_TO_COLLECTIONS,
).reduce(
  (acc, [project, collections]) => {
    collections.forEach((collection) => {
      if (!acc[collection]) acc[collection] = []
      acc[collection].push(project)
    })
    return acc
  },
  {} as Record<string, string[]>,
)

/**
 * All collections across all projects (union)
 * Computed once at module load for O(1) access
 * Used by OpenAPI spec filter when no specific project is selected
 */
const ALL_PROJECT_COLLECTIONS: CollectionSlug[] = (() => {
  const allCollections = new Set<CollectionSlug>()
  Object.values(PROJECT_TO_COLLECTIONS).forEach((collections) => {
    collections.forEach((c) => allCollections.add(c))
  })
  return Array.from(allCollections)
})()

// =============================================================================
// Type Generation Helpers (for schemaExtension.ts)
// =============================================================================

/**
 * Get array of project slugs for TypeScript type generation
 * @returns Array of project slugs
 */
export function getProjectSlugs(): string[] {
  return Object.keys(PROJECTS)
}

/**
 * Get array of role slugs for TypeScript type generation
 * @returns Array of role slugs
 */
export function getRoleSlugs(): string[] {
  return Object.keys(ROLES)
}

// =============================================================================
// UI/Branding Functions (from projects.ts)
// =============================================================================

/**
 * Get icon path for a project (or default for admin view)
 * @param project - Project slug or null for admin view
 * @returns Icon file path
 */
export function getProjectIcon(project: string | null): string {
  if (!project) return ADMIN_VIEW_ICON
  const projectConfig = PROJECTS[project as keyof typeof PROJECTS]
  return projectConfig?.icon || ADMIN_VIEW_ICON
}

/**
 * Get human-readable label for a project
 * @param project - Project slug or null for admin view
 * @returns Human-readable project label
 */
export function getProjectLabel(project: string | null): string {
  if (!project) return ADMIN_VIEW_LABEL
  const projectConfig = PROJECTS[project as keyof typeof PROJECTS]
  return projectConfig?.label || project
}

/**
 * Get project select options for Payload fields and UI selectors
 * @returns Array of project options with value and label
 */
export function getProjectOptions(): Array<{ value: string; label: string }> {
  return Object.entries(PROJECTS).map(([value, config]) => ({
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
// Access Control Functions (from data.ts)
// =============================================================================

/**
 * Get the project associated with a role
 * @param role - Role slug
 * @returns Project slug or undefined
 */
export function getRoleProject(role: string): string | undefined {
  const roleConfig = ROLES[role as keyof typeof ROLES]
  return roleConfig?.project
}

/**
 * Get collections available in a project (includes globals)
 * @param project - Project slug
 * @returns Array of collection/global slugs
 */
export function getProjectCollections(project: string): CollectionSlug[] {
  return PROJECT_TO_COLLECTIONS[project] || []
}

/**
 * Get permissions for a single role (explicit only, no implicit reads)
 *
 * Used by PermissionsTable component and permission checking logic.
 *
 * @param role - Role slug
 * @returns Permissions object mapping collection slugs to permission levels
 */
export function getPermissionsForRole(role: string): Record<string, PermissionLevel[]> {
  const roleConfig = ROLES[role as keyof typeof ROLES]
  return roleConfig?.permissions || {}
}

/**
 * Get role options filtered by allowed roles
 * @param allowedRoles - Array of role slugs to include
 * @returns Array of role options with value and label
 * @throws Error if any role slug is invalid
 */
export function getRoleOptions(allowedRoles: string[]): Array<{ label: string; value: string }> {
  return allowedRoles.map((roleSlug) => {
    const roleConfig = ROLES[roleSlug as keyof typeof ROLES]
    if (!roleConfig) {
      throw new Error(
        `Invalid role slug: "${roleSlug}". Valid roles are: ${Object.keys(ROLES).join(', ')}`,
      )
    }
    return { label: roleConfig.label, value: roleSlug }
  })
}

/**
 * Get all collections across all projects (union)
 * @returns Pre-computed array of all collection slugs from all projects
 */
export function getAllProjectCollections(): CollectionSlug[] {
  return ALL_PROJECT_COLLECTIONS
}

/**
 * Check if a collection has any role with translate permission
 * Used to determine if field-level access should be applied
 * @param collection - Collection slug
 * @returns True if collection has translate permissions
 */
export function isTranslatableCollection(collection: string): boolean {
  return TRANSLATABLE_COLLECTIONS.has(collection)
}

// =============================================================================
// Unified Visibility Helper (for accessPlugin.ts)
// =============================================================================

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
  collection: string,
  currentProject: string | null,
): boolean {
  const allowedProjects = COLLECTION_TO_PROJECTS[collection]

  // Not in any project → visible to all (shared collection)
  if (!allowedProjects || allowedProjects.length === 0) return true

  // Admin view (null) → visible to all
  if (currentProject === null) return true

  // Check if current project includes this collection
  return allowedProjects.includes(currentProject)
}

/**
 * Get all collections with implicit read access for given roles
 *
 * This is a higher-level function that builds on isCollectionVisibleInProject.
 * For each role, it finds the associated project and adds all collections visible in that project.
 *
 * Includes:
 * - Project collections (collections in the role's project)
 * - Shared collections (collections not in any project, visible to all)
 *
 * @param roles - Array of role slugs
 * @returns Array of collection slugs readable by these roles
 */
export function getReadableCollections(roles: string[]): string[] {
  const collections = new Set<string>()

  // Get all collections visible for each role's project
  for (const role of roles) {
    const project = getRoleProject(role)
    // Use isCollectionVisibleInProject to check each collection
    // This ensures we use the same visibility logic everywhere
    getAllProjectCollections().forEach((collection) => {
      if (isCollectionVisibleInProject(collection, project || null)) {
        collections.add(collection)
      }
    })
  }

  // Also add shared collections (not in any project)
  // These are visible to all users via isCollectionVisibleInProject returning true
  Object.keys(COLLECTION_TO_PROJECTS).forEach((collection) => {
    if (!COLLECTION_TO_PROJECTS[collection]?.length) {
      collections.add(collection)
    }
  })

  return Array.from(collections).sort()
}
