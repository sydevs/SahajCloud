/**
 * Strongly-typed permissions interfaces for the application
 *
 * This file is part of the type organization structure:
 * - @/types/roles - Role definitions (ManagerRole, ClientRole, PermissionLevel)
 * - @/types/users - User types (TypedManager, TypedClient)
 * - @/types/permissions - Permission structures (this file)
 */

import type { CollectionSlug } from 'payload'

import type { ProjectValue } from '@/lib/projects'
import type { PermissionLevel } from '@/types/roles'

/**
 * Type for the cached permissions structure returned by virtual permissions field
 *
 * This structure is populated by the afterRead hook in ManagerPermissionsField()
 * and ClientPermissionsField(), providing efficient permission caching without
 * requiring separate cache management.
 *
 * For managers: Locale-aware permissions + cross-locale projects array
 * For clients: Global permissions (no projects array)
 *
 * @example
 * // Manager permissions structure
 * {
 *   meditations: ['read', 'create', 'update'],
 *   pages: ['read', 'translate'],
 *   projects: ['wemeditate-web', 'wemeditate-app']
 * }
 *
 * @example
 * // Client permissions structure
 * {
 *   meditations: ['read'],
 *   pages: ['read'],
 *   forms: ['read']
 * }
 *
 * @example
 * // Type-safe access using CollectionSlug
 * const permissions: MergedPermissions = user.permissions
 * const meditationPerms = permissions['meditations'] // PermissionLevel[] | ProjectValue[] | undefined
 * const projects = permissions.projects // ProjectValue[] | undefined
 */
export interface MergedPermissions {
  /**
   * Array of projects the user has access to (managers only)
   * Union of all projects across all locales
   */
  projects?: ProjectValue[]

  /**
   * Collection-level permissions
   * Keys should be CollectionSlug values (e.g., 'meditations', 'pages')
   * Values are arrays of PermissionLevel ('read', 'create', 'update', 'delete', 'translate')
   *
   * Note: TypeScript index signatures require string type, but keys should be
   * valid CollectionSlug values at runtime.
   */
  [key: string]: PermissionLevel[] | ProjectValue[] | undefined
}

/**
 * Helper type for type-safe access to collection permissions
 * Use this when you need strict type checking for specific collections
 *
 * @example
 * function getCollectionPerms(permissions: MergedPermissions, collection: CollectionSlug) {
 *   return permissions[collection] as PermissionLevel[] | undefined
 * }
 */
export type CollectionPermissions = Record<CollectionSlug, PermissionLevel[] | undefined>
