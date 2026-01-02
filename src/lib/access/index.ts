/**
 * Access Control for PayloadCMS
 *
 * This module provides:
 * - accessPlugin: Main plugin for unified RBAC and project visibility
 * - hasPermission: Static permission checking function
 * - bypassPermissions: Shared bypass function for accessPlugin and tests
 * - filterAvailableLocales: Locale filtering for admin UI
 * - Helper functions for projects, roles, and permissions (consolidated from projects.ts and data.ts)
 * - Utility types and functions
 *
 * Simplified Architecture:
 * - Static functions (no factory pattern)
 * - No exported constants (all access via functions)
 * - Bypass logic via shared bypassPermissions function
 */

// ============================================================================
// PLUGIN (main export)
// ============================================================================

export { accessPlugin, hasPermission, hasAnyPermission } from './accessPlugin'
export type { AccessPluginOptions } from './accessPlugin'

// ============================================================================
// BYPASS FUNCTION (shared between accessPlugin and tests)
// ============================================================================

export { bypassPermissions } from './bypassPermissions'

// ============================================================================
// UTILITIES
// ============================================================================

export { filterAvailableLocales } from './filterAvailableLocales'

// ============================================================================
// HELPER FUNCTIONS (public API - consolidated from projects.ts and data.ts)
// ============================================================================

export {
  // Type generation helpers
  getProjectSlugs,
  getRoleSlugs,
  // UI/Branding functions (from projects.ts)
  getProjectIcon,
  getProjectLabel,
  getProjectOptions,
  isValidProject,
  // Access control functions (from data.ts)
  getRoleProject,
  getProjectCollections,
  getAllProjectCollections,
  getRoleOptions,
  getPermissionsForRole,
  getReadableCollections,
  getProjectsFromRoles,
  // Unified visibility helper
  isCollectionVisibleInProject,
} from './config'

// ============================================================================
// TYPES (public API)
// ============================================================================

export type {
  BypassPermissionFunction,
  PermissionLevel,
  PermissionCheckArgs,
  TypedAuthUser,
} from './types'
