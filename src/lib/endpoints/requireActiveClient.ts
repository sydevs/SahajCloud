import type { PayloadRequest } from 'payload'

/**
 * Active-client auth guard shared by the public client endpoints.
 *
 * Returns a `403` {@link Response} when the request is **not** authenticated as
 * an active `clients` user, or `null` when the caller is allowed through. This
 * is the single source for the guard's shape and message — handlers short-circuit
 * on a non-null return:
 *
 * ```typescript
 * const denied = requireActiveClient(req)
 * if (denied) return denied
 * ```
 */
export function requireActiveClient(req: PayloadRequest): Response | null {
  if (req.user?.collection !== 'clients' || !req.user.active) {
    return Response.json(
      { errors: [{ message: 'You are not allowed to perform this action.' }] },
      { status: 403 },
    )
  }
  return null
}
