/**
 * Role type definitions for managers and clients
 */

import type { Operation } from 'payload'

import type { ProjectSlug } from '@/lib/projects'

// ============================================================================
// Role Enum Types
// ============================================================================

export type ManagerRole = 'meditations-editor' | 'path-editor' | 'translator'

/**
 * ClientRole is derived from ProjectSlug to ensure consistency between
 * admin project slugs and API client role slugs.
 */
export type ClientRole = ProjectSlug

// ============================================================================
// Permission Level Type
// ============================================================================

export type PermissionLevel = Operation | 'translate'

// ============================================================================
// Role Configuration Interfaces
// ============================================================================

export interface BaseRoleConfig {
  slug: string
  label: string
  description: string
  permissions: {
    [collection: string]: PermissionLevel[]
  }
}

export interface ManagerRoleConfig extends BaseRoleConfig {
  project: ProjectSlug // Project this role grants access to
}

export type ClientRoleConfig = BaseRoleConfig
