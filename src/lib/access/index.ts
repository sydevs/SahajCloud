/**
 * Access Control for PayloadCMS
 *
 * This module provides:
 * - accessPlugin: Main plugin for unified RBAC and project visibility
 * - filterAvailableLocales: Locale filtering for admin UI
 * - Utility types and functions
 */

// Main plugin
export { accessPlugin } from './accessPlugin'

// Locale filtering
export { filterAvailableLocales } from './filterAvailableLocales'

// Types
export type {
  AccessPluginOptions,
  ProjectConfig,
  ManagerRoleConfig,
  ClientRoleConfig,
  BypassResult,
  ManagerBypassFn,
  ClientBypassFn,
  // Role types (re-exported from payload-types via types.ts)
  ManagerRole,
  ClientRole,
  // Permission type (defined in types.ts, not generated)
  PermissionLevel,
  // Lookup types
  PermissionLookup,
  ProjectLookup,
  TypedManager,
  TypedClient,
} from './types'


// Permission checking utilities (for custom access control)
export { isAPIClient, hasWritePermission, createFieldAccess } from './permissions'

// Factory exports for tests (to use same permission logic as production)
export { createPermissionChecker } from './permissions'
export { buildPermissionLookup } from './lookupTables'
