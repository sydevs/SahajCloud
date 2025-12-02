/**
 * Role type definitions for managers and clients
 */

import type { Operation } from 'payload'

import type { ProjectValue } from '@/lib/projects'

// ============================================================================
// Role Enum Types
// ============================================================================

export type ManagerRole = 'meditations-editor' | 'path-editor' | 'translator'
export type ClientRole = 'we-meditate-web' | 'we-meditate-app' | 'sahaj-atlas'

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
  project: ProjectValue // Project this role grants access to
}

export type ClientRoleConfig = BaseRoleConfig
