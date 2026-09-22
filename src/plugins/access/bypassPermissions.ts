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

  // --- MANAGER BYPASS (ordered by frequency for optimal short-circuiting) ---
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

  // --- CLIENT BYPASS (high volume, simple check) ---
  if (user.collection === 'clients') {
    const client = user as unknown as Client

    // Unpublished (draft) client blocking — publish/unpublish is the auth gate
    if (client._status !== 'published') return 'deny'

    // Fall through to self-access check below
  }

  // --- SELF-ACCESS (rare - users accessing their own document), checked last ---
  if (user.collection === collection && user.id === docId) {
    if (operation === 'read') return 'allow'

    // Update is `managers` alone (#827): a client row is operator
    // configuration with no editable half. Allowlisted, so a third auth
    // collection fails closed rather than inheriting the grant.
    if (operation === 'update' && user.collection === 'managers') return 'allow'
  }

  return 'continue'
}
