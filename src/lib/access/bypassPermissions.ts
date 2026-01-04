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

import type { BypassPermissionFunction } from './types'

import type { Client, Manager } from '@/payload-types'

export const bypassPermissions: BypassPermissionFunction = (user, context) => {
  const { collection, operation, docId } = context

  // =========================================================================
  // MANAGER BYPASS (ordered by frequency for optimal short-circuiting)
  // =========================================================================
  if (user.collection === 'managers') {
    const manager = user as unknown as Manager

    // 1. Admin bypass (most common success path for managers)
    if (manager.type === 'admin') return 'allow'

    // 2. Inactive manager blocking (quick rejection)
    if (manager.type === 'inactive') return 'deny'

    // 3. customResourceAccess: Allow update for specific documents
    //    Only checked for update operations with a docId
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

    // Fall through to self-access check below
  }

  // =========================================================================
  // CLIENT BYPASS (high volume, simple check)
  // =========================================================================
  if (user.collection === 'clients') {
    const client = user as unknown as Client

    // Inactive client blocking
    if (!client.active) return 'deny'

    // Fall through to self-access check below
  }

  // =========================================================================
  // SELF-ACCESS (rare - users accessing their own document)
  // Applies to both managers and clients, checked last
  // =========================================================================
  if (user.collection === collection && user.id === docId) {
    if (operation === 'read' || operation === 'update') {
      return 'allow'
    }
  }

  return 'continue'
}
