/**
 * Access Control for PayloadCMS
 *
 * This module provides:
 * - accessPlugin: Main plugin for unified RBAC and project visibility
 * - hasPermission: Static permission checking function
 * - filterAvailableLocales: Locale filtering for admin UI
 * - Helper functions for projects, roles, and permissions (consolidated from projects.ts and data.ts)
 * - Utility types and functions
 *
 * Simplified Architecture:
 * - Static functions (no factory pattern)
 * - No exported constants (all access via functions)
 * - Bypass logic configured in payload.config.ts
 */

// ============================================================================
// PLUGIN (main export)
// ============================================================================

export { accessPlugin, hasPermission, hasAnyPermission } from './accessPlugin'
export type { AccessPluginOptions } from './accessPlugin'

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
  getRoleOptions,
  getPermissionsForRole,
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
