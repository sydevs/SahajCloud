/**
 * Access Control Configuration - Barrel Export
 *
 * Single source of truth for projects, roles, and access control data.
 * All configuration is internal - external access only via helper functions.
 *
 * This module re-exports from:
 * - projects.ts: Project configuration and helpers
 * - roles.ts: Role configuration and helpers
 */

// =============================================================================
// Project Configuration & Helpers
// =============================================================================

export {
  // Type generation
  getProjectSlugs,
  // UI/Branding functions
  getProjectIcon,
  getProjectLabel,
  getProjectOptions,
  isValidProject,
  // Access control functions
  getProjectCollections,
  getAllProjectCollections,
  isCollectionVisibleInProject,
} from './projects'

// =============================================================================
// Role Configuration & Helpers
// =============================================================================

export {
  // Type generation
  getRoleSlugs,
  // Role helper functions
  getRoleProject,
  getPermissionsForRole,
  getRoleOptions,
  isTranslatableCollection,
  getProjectsFromRoles,
  getReadableCollections,
} from './roles'
