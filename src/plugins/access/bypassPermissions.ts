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

import type { Client } from '@/payload-types'

export const bypassPermissions: BypassPermissionFunction = (user, context) => {
  const { collection, operation, docId } = context

  // =========================================================================
  // MANAGER BYPASS (ordered by frequency for optimal short-circuiting)
  // =========================================================================
  if (user.collection === 'managers') {
    const managerType = (user as { type?: string }).type

    // 1. Admin bypass (most common success path for managers)
    if (managerType === 'admin') return 'allow'

    // 2. Inactive manager blocking (quick rejection)
    if (managerType === 'inactive') return 'deny'

    // Active non-admin managers fall through to the self-access check below.
    // Document-level manager access (the successor to customResourceAccess) is
    // resolved asynchronously in createAccessConfig — it needs the target
    // document's fields and a DB query, which this synchronous bypass cannot do.
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
