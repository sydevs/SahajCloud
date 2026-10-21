import type { PayloadRequest } from 'payload'

import type { PermissionCheckArgs } from '@/plugins/access'
import { holdsCollectionPermission } from '@/plugins/access'

import { requireActiveManager } from './requireActiveManager'

type PermissionGate = {
  req: PayloadRequest
  collection: PermissionCheckArgs['collection']
  operation: PermissionCheckArgs['operation']
  /** The refusal message. Per endpoint, because a caller reads it. */
  forbidden: string
}

/**
 * Gate a custom endpoint on one collection permission, evaluated in the
 * **request's** locale. Returns a `403` {@link Response}, or `null` when the
 * caller may proceed.
 *
 * ⚠ **The locale scope is the whole point of this helper**, and
 * `holdsCollectionPermission` (`@/plugins/access`) owns it — a manager's roles
 * are per locale, so a request naming none resolves to the **default** locale
 * and silently 403s anyone whose roles live only elsewhere (#701, #665,
 * `docs/rules/access.md`). A hand-rolled admin `fetch` must therefore send
 * `?locale=`. All this adds is the 403 envelope.
 */
export function requireCollectionPermission({
  req,
  collection,
  operation,
  forbidden,
}: PermissionGate): Response | null {
  if (!holdsCollectionPermission({ req, collection, operation })) {
    return Response.json({ errors: [{ message: forbidden }] }, { status: 403 })
  }
  return null
}

/**
 * {@link requireCollectionPermission} for an endpoint that serves the admin
 * panel alone: {@link requireActiveManager} runs first, so an API client is
 * refused as a caller rather than on its grants.
 *
 * ⚠ **An endpoint that serves API clients needs more than the other helper.**
 * Gating on the permission alone is right for a route managers and clients
 * share, but `requireActiveClient` is what reports a presented-and-rejected
 * API key (#743, `docs/rules/endpoints.md`) — neither function here does, so a
 * client-facing endpoint still calls it as its first statement.
 */
export function requireManagerPermission(gate: PermissionGate): Response | null {
  const denied = requireActiveManager(gate.req)
  if (denied) return denied
  return requireCollectionPermission(gate)
}
