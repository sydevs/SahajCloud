import type { PayloadRequest } from 'payload'

/**
 * Admin-endpoint auth guard: the caller must be authenticated as a `managers`
 * user. The self-service counterpart to {@link requireActiveClient} (which
 * guards public API `clients`). Returns a `403` {@link Response} when the caller
 * is not a manager, or `null` when allowed through — handlers short-circuit on a
 * non-null return:
 *
 * ```typescript
 * const denied = requireManager(req)
 * if (denied) return denied
 * ```
 *
 * It intentionally does not check `type`, matching the self-access bypass that
 * already lets any manager update their own document. Endpoints using it must
 * still scope their write to `req.user.id` (never an arbitrary id).
 */
export function requireManager(req: PayloadRequest): Response | null {
  if (req.user?.collection !== 'managers') {
    return Response.json(
      { errors: [{ message: 'You are not allowed to perform this action.' }] },
      { status: 403 },
    )
  }
  return null
}
