import type { PayloadRequest } from 'payload'

import type { PermissionCheckArgs } from '@/plugins/access'
import { bypassPermissions, hasPermission, roleScopeFromLocale } from '@/plugins/access'

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
 * ⚠ **The locale scope is the whole point of this helper.** A manager's roles
 * are per locale, so the scope comes from `req.locale` via
 * `roleScopeFromLocale`; a request naming no locale resolves to the **default**
 * locale, and the gate then reads the caller's English roles and silently 403s
 * anyone whose roles live only elsewhere (#701, #665, `docs/rules/access.md`).
 * A hand-rolled admin `fetch` must therefore send `?locale=`. Never derive the
 * scope by hand — `roleScopeFromLocale` is what refuses `all` and keeps a
 * request from naming `union`.
 *
 * `bypassPermissions` is passed, so an admin manager is admitted and an
 * inactive manager or unpublished client denied before any role lookup — the
 * same step 2 every collection's own access config runs
 * (`docs/rules/access.md` § Permission flow).
 */
export function requireCollectionPermission({
  req,
  collection,
  operation,
  forbidden,
}: PermissionGate): Response | null {
  const permitted = hasPermission(
    {
      user: req.user,
      collection,
      operation,
      locale: roleScopeFromLocale(req.locale),
    },
    bypassPermissions,
  )
  if (!permitted) {
    return Response.json({ errors: [{ message: forbidden }] }, { status: 403 })
  }
  return null
}

/**
 * {@link requireCollectionPermission} for an endpoint that serves the admin
 * panel alone: the caller must also be an active manager, so an API client is
 * refused by {@link requireActiveManager} — which is what reports a
 * presented-and-rejected API key (#743, `docs/rules/endpoints.md`).
 *
 * An endpoint that also serves API clients gates on the permission alone.
 */
export function requireManagerPermission(gate: PermissionGate): Response | null {
  const denied = requireActiveManager(gate.req)
  if (denied) return denied
  return requireCollectionPermission(gate)
}
