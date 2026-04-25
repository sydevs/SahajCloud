import type { Condition, FieldAccess, PayloadRequest } from 'payload'

/**
 * Admin-only access helpers.
 *
 * Centralizes the "is this request from an admin manager?" check used by
 * field-level access configs (e.g. `Managers.type`, `MeditationTags.title`)
 * and by hooks that need the same predicate outside a FieldAccess context
 * (e.g. blocking non-admin icon uploads on meditation-tags).
 */

/**
 * True when the request user is an active admin manager.
 *
 * Use in hooks, resolvers, or any code that has access to the user object
 * but is not itself a PayloadCMS `Access` / `FieldAccess` function.
 */
export function isAdminManager(user: PayloadRequest['user']): boolean {
  return user?.collection === 'managers' && user.type === 'admin'
}

/**
 * Field-level access: only admin managers may update the field.
 *
 * Pass directly to `access.update` (or `access.create`/`access.read`) on an
 * individual field to lock non-admin managers out of editing it. Read/create
 * default to open; apply explicitly where you want them restricted too.
 */
export const adminOnlyFieldAccess: FieldAccess = ({ req }) => isAdminManager(req.user)

/**
 * Admin-only admin-UI condition: hides the field from non-admin managers.
 *
 * Pair with `adminOnlyFieldAccess` on the same field to get both (a) visual
 * UX — non-admins never see the input — and (b) API enforcement — direct
 * PATCHes to the field are silently stripped. The condition covers UX; the
 * access guard is the security boundary.
 */
export const adminOnlyCondition: Condition = (_data, _siblingData, { user }) =>
  isAdminManager(user)
