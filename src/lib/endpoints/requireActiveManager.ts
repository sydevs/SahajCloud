import type { PayloadRequest } from 'payload'

/**
 * Admin-endpoint auth guard: the caller must be an **active** `managers` user.
 * The self-service counterpart to {@link requireActiveClient} (which guards
 * published API `clients`). Returns a `403` {@link Response} for anyone who is
 * not an active manager — unauthenticated callers, API clients, and `inactive`
 * managers alike — or `null` when allowed through. Handlers short-circuit on a
 * non-null return:
 *
 * ```typescript
 * const denied = requireActiveManager(req)
 * if (denied) return denied
 * ```
 *
 * Rejecting `inactive` mirrors the access bypass (`bypassPermissions.ts`:
 * inactive → deny, checked before self-access), so an admin-panel self-service
 * write can't do anything an inactive manager is otherwise locked out of.
 * Callers must still scope their write to `req.user.id` (never an arbitrary id).
 */
export function requireActiveManager(req: PayloadRequest): Response | null {
  const user = req.user
  if (user?.collection !== 'managers' || (user as { type?: string }).type === 'inactive') {
    return Response.json(
      { errors: [{ message: 'You are not allowed to perform this action.' }] },
      { status: 403 },
    )
  }
  return null
}
