/**
 * Type definitions for the Access Plugin
 *
 * This module defines all interfaces for configuring the accessPlugin,
 * including project configuration, role definitions, bypass functions,
 * and lookup table structures.
 */

import type { Operation, TypedUser } from 'payload'

import type { LocaleCode } from '@/lib/locales'
import type {
  ClientRole,
  Manager,
  ManagerRole,
  ProjectSlug,
} from '@/payload-types'

// Re-export generated types for convenience
export type { ClientRole, ManagerRole, ProjectSlug }

// ============================================================================
// Permission Level Type
// ============================================================================

/**
 * Permission operations supported by the access system
 * - Standard CRUD operations from Payload
 * - 'translate' for localized field updates only
 */
export type PermissionLevel = Operation | 'translate'

// ============================================================================
// Merged Permissions Type (Backward Compatibility)
// ============================================================================

/**
 * Type for the merged permissions structure
 * Used by mergeRolePermissions() and backward-compatible access functions
 *
 * @example
 * {
 *   meditations: ['read', 'create', 'update'],
 *   pages: ['read', 'translate'],
 * }
 */
export interface MergedPermissions {
  [key: string]: PermissionLevel[] | undefined
}

// ============================================================================
// Project Configuration
// ============================================================================

/**
 * Configuration for a single project
 */
export interface ProjectConfig {
  /** Collections visible when this project is selected */
  collections: string[]
  /** Globals visible when this project is selected */
  globals?: string[]
}

// ============================================================================
// Role Configuration
// ============================================================================

/**
 * Base configuration for a role (shared between managers and clients)
 */
export interface BaseRoleConfig {
  /** Human-readable label for the role */
  label: string
  /** Optional description explaining the role's purpose */
  description?: string
  /**
   * Explicit permissions granted by this role
   * Note: Roles also get implicit read access to their project's collections
   */
  permissions: Record<string, PermissionLevel[]>
}

/**
 * Manager role configuration (extends base with project association)
 */
export interface ManagerRoleConfig extends BaseRoleConfig {
  /**
   * Project this role is associated with
   * Grants implicit read access to all collections in this project
   */
  project: string
}

/**
 * Client role configuration (extends base with project association)
 */
export interface ClientRoleConfig extends BaseRoleConfig {
  /**
   * Project this client role is associated with
   * Grants implicit read access to all collections in this project
   */
  project: string
}

// ============================================================================
// Bypass Functions
// ============================================================================

/**
 * Result of a bypass function check
 * - 'allow': Grant access immediately, skip further checks
 * - 'deny': Block access immediately, skip further checks
 * - 'continue': Continue with normal role-based checking
 */
export type BypassResult = 'allow' | 'deny' | 'continue'

/**
 * Arguments passed to manager bypass function
 */
export interface ManagerBypassArgs {
  /** The authenticated manager user */
  user: TypedManager
  /** Collection or global slug being accessed */
  collection: string
  /** Operation being performed */
  operation: Operation
  /** Document ID (for update/delete operations) */
  docId?: string | number
}

/**
 * Arguments passed to client bypass function
 */
export interface ClientBypassArgs {
  /** The authenticated client user */
  user: TypedClient
  /** Collection or global slug being accessed */
  collection: string
  /** Operation being performed */
  operation: Operation
}

/**
 * Manager bypass function type
 */
export type ManagerBypassFn = (args: ManagerBypassArgs) => BypassResult

/**
 * Client bypass function type
 */
export type ClientBypassFn = (args: ClientBypassArgs) => BypassResult

// ============================================================================
// Plugin Options
// ============================================================================

/**
 * Configuration options for the accessPlugin
 */
export interface AccessPluginOptions {
  /**
   * Project definitions with their collections and globals
   * Collections not in any project are implicitly available to all
   */
  projects: Record<string, ProjectConfig>

  /**
   * Role definitions grouped by auth collection
   */
  roles: {
    /** Manager roles (localized, with project association) */
    managers: Record<string, ManagerRoleConfig>
    /** Client roles (non-localized, API access) */
    clients: Record<string, ClientRoleConfig>
  }

  /**
   * Optional bypass functions for custom access logic
   * Checked BEFORE role-based access
   */
  bypass?: {
    managers?: ManagerBypassFn
    clients?: ClientBypassFn
  }
}

// ============================================================================
// Lookup Table Types (Internal)
// ============================================================================

/**
 * Pre-computed permission lookup table
 * Structure: Map<roleSlug, Map<collectionSlug, Set<operation>>>
 * Provides O(1) permission lookups
 */
export interface PermissionLookup {
  /** Manager role permissions (includes implicit read from project) */
  managers: Map<string, Map<string, Set<PermissionLevel>>>
  /** Client role permissions */
  clients: Map<string, Map<string, Set<PermissionLevel>>>
}

/**
 * Pre-computed project lookup table
 */
export interface ProjectLookup {
  /** Map collection slug to set of projects that include it */
  collections: Map<string, Set<string>>
  /** Map global slug to set of projects that include it */
  globals: Map<string, Set<string>>
  /** Map project slug to set of collections in that project */
  projectCollections: Map<string, Set<string>>
}

// ============================================================================
// User Types (for type safety in access checks)
// ============================================================================

/**
 * Extended manager user type for access checking
 */
export type TypedManager = TypedUser & {
  collection: 'managers'
  type?: Manager['type']
  roles?: string[] | Record<LocaleCode, string[]>
  customResourceAccess?: Array<{ relationTo: string; value: string | number }>
  currentProject?: string | null
}

/**
 * Extended client user type for access checking
 */
export type TypedClient = TypedUser & {
  collection: 'clients'
  roles?: string[]
}

// ============================================================================
// Permission Check Arguments
// ============================================================================

/**
 * Arguments for permission checking
 */
export interface PermissionCheckArgs {
  /** The authenticated user (manager or client) */
  user: TypedUser | null
  /** Collection or global slug being accessed */
  collection: string
  /** Operation being performed */
  operation: Operation
  /** Field metadata for field-level access */
  field?: { localized: boolean }
  /** Current locale for manager role extraction */
  locale?: LocaleCode
  /** Document ID for document-level permissions */
  docId?: string | number
}

