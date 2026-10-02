import type { Condition, FieldAccess, PayloadRequest } from 'payload'

/**
 * Admin-only access helpers.
 *
 * Centralizes the "is this request from an admin manager?" check used by
 * field-level access configs (e.g. `Managers.type`, `UserChoices.title`)
 * and by hooks that need the same predicate outside a FieldAccess context
 * (e.g. blocking non-admin icon uploads on user-choices).
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
 * Field-level access: a `clients`-collection caller may never read or write it.
 *
 * Wider than `adminOnlyFieldAccess` on purpose — a client's own managers must
 * still configure their service. It guards the fields on the documents a
 * published key still reaches — an unrestricted collection (`forms`), and its
 * own row, which self-access hands over whole (#822).
 * See `docs/rules/access.md`, "A field lock, for a collection a client
 * reaches", for why, and why it is spelled positively.
 */
export const managersOnlyFieldAccess: FieldAccess = ({ req }) =>
  req.user?.collection === 'managers'

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

/**
 * Field-level access: the account holder, or an admin manager.
 *
 * For a field on an auth collection that is the person's own business but
 * nobody else's — their address, their contact handles, what they were granted.
 * `adminOnlyFieldAccess` is the wrong tool there: it would hide a manager's own
 * profile from them.
 *
 * ⚠ **On `create` there is no document, so this is admin-only.** `id` is the
 * row's own id wherever a field lock is evaluated — `afterRead` passes
 * `doc.id`, so a list read answers per row — and `undefined` on a create. A
 * field that a non-admin must set on create therefore needs its own `create`
 * entry rather than this one.
 */
export const selfOrAdminFieldAccess: FieldAccess = ({ id, req: { user } }) => {
  if (isAdminManager(user)) return true
  // Inactive is denied at the collection level already; restated because a
  // field lock is the last gate and cheap to make unconditional.
  if (user?.collection !== 'managers' || user.type === 'inactive') return false
  return id !== undefined && String(user.id) === String(id)
}
