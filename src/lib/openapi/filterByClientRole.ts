/**
 * Client Role-Based OpenAPI Filtering
 *
 * Utilities for filtering OpenAPI specifications based on client role permissions.
 * Uses CLIENT_ROLES from PermissionsField.ts as the source of truth for which
 * collections each client role can access.
 */

import { CLIENT_ROLES } from '@/fields/permissionsField'
import type { ClientRole } from '@/types/roles'

/**
 * Get collections accessible to a specific client role
 *
 * @param role - The client role to get collections for
 * @returns Array of collection slugs the role can access
 */
export function getCollectionsForRole(role: ClientRole): string[] {
  const roleConfig = CLIENT_ROLES[role]
  if (!roleConfig) return []
  return Object.keys(roleConfig.permissions)
}

/**
 * Get union of all collections accessible across all client roles
 * Used when no specific role is selected ("All Endpoints" view)
 *
 * @returns Array of unique collection slugs accessible by any client role
 */
export function getAllClientCollections(): string[] {
  const allCollections = new Set<string>()

  Object.values(CLIENT_ROLES).forEach((roleConfig) => {
    Object.keys(roleConfig.permissions).forEach((collection) => {
      allCollections.add(collection)
    })
  })

  return Array.from(allCollections)
}

/**
 * Validate if a string is a valid client role
 *
 * @param role - String to validate
 * @returns True if the string is a valid ClientRole
 */
export function isValidClientRole(role: string): role is ClientRole {
  return Object.keys(CLIENT_ROLES).includes(role)
}

/**
 * Get labels for all client roles (for UI display)
 *
 * @returns Array of {value, label} objects for each client role
 */
export function getClientRoleOptions(): { value: ClientRole; label: string }[] {
  return Object.values(CLIENT_ROLES).map((roleConfig) => ({
    value: roleConfig.slug as ClientRole,
    label: roleConfig.label,
  }))
}
