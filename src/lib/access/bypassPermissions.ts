/**
 * Bypass Permission Function
 *
 * Shared bypass logic used by accessPlugin and tests.
 * This function is called BEFORE role-based permission checks.
 *
 * Returns:
 * - 'allow' to grant access immediately
 * - 'deny' to block access immediately
 * - 'continue' to proceed with role-based checks
 */

import type { Client, Manager } from '@/payload-types'
import type { BypassPermissionFunction } from './types'

export const bypassPermissions: BypassPermissionFunction = (user, context) => {
  const { collection, operation, docId } = context

  // Self-access check (users can read/update their own document)
  if (user.collection === collection && user.id === docId) {
    if (operation === 'read' || operation === 'update') {
      return 'allow'
    }
  }

  // Manager bypass logic
  if (user.collection === 'managers') {
    const manager = user as unknown as Manager

    // 1. Inactive manager blocking
    if (manager.type === 'inactive') return 'deny'

    // 2. Admin bypass (full access)
    if (manager.type === 'admin') return 'allow'

    // 3. customResourceAccess: Allow update for specific documents
    if (
      operation === 'update' &&
      docId &&
      manager.customResourceAccess &&
      Array.isArray(manager.customResourceAccess)
    ) {
      const hasAccess = manager.customResourceAccess.some(
        (access) =>
          typeof access === 'object' &&
          access !== null &&
          access.relationTo === collection &&
          String(access.value) === String(docId),
      )
      if (hasAccess) return 'allow'
    }
  }

  // Client bypass logic
  if (user.collection === 'clients') {
    const client = user as unknown as Client

    // 1. Inactive client blocking
    if (!client.active) return 'deny'
  }

  return 'continue'
}
