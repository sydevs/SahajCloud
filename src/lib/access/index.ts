/**
 * Access Control for PayloadCMS
 *
 * This module provides:
 * - accessPlugin: Main plugin for unified RBAC and project visibility
 * - adminOrSelfAccess: Access control for auth collections (Managers, Clients)
 * - filterAvailableLocales: Locale filtering for admin UI
 * - Utility types and functions
 */

// Main plugin
export { accessPlugin } from './accessPlugin'

// Auth collection access (not managed by plugin)
export { adminOrSelfAccess } from './accessControl'

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
  // Backward compatibility types
  MergedPermissions,
  PermissionLookup,
  ProjectLookup,
  TypedManager,
  TypedClient,
} from './types'

// Visibility utilities (for custom admin.hidden functions)
export { adminOnlyHidden, handleProjectVisibility } from './visibility'

// Permission checking utilities (for custom access control)
export { isAPIClient, hasWritePermission } from './permissions'

// DEPRECATED: Backward compatibility exports (will be removed after migration)
// These are used by formBuilderPlugin overrides and content collections until they're migrated to the plugin
export { roleBasedAccess, hasPermission, createFieldAccess } from './accessControl'
