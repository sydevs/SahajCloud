import type { Condition, FieldAccess, PayloadRequest } from 'payload'

import type { ProjectSlug } from '@/payload-types'

import { resolveProject } from './config/currentProject'

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

type ManagerUser = Extract<NonNullable<PayloadRequest['user']>, { collection: 'managers' }>

/**
 * True for an active, non-admin manager (`type: 'manager'`), optionally only
 * while `project` is the one they work in — as `resolveProject` decides it, so
 * a stored project they can no longer reach does not count. Admins and
 * inactive managers are excluded, and no role is tested directly.
 */
export function isManager(
  user: PayloadRequest['user'] | undefined,
  project?: ProjectSlug,
): user is ManagerUser {
  if (user?.collection !== 'managers' || user.type !== 'manager') return false
  return project === undefined || resolveProject(user).project === project
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
export const managersOnlyFieldAccess: FieldAccess = ({ req }) => req.user?.collection === 'managers'

/**
 * Admin-only admin-UI condition: hides the field from non-admin managers.
 *
 * Pair with `adminOnlyFieldAccess` on the same field to get both (a) visual
 * UX — non-admins never see the input — and (b) API enforcement — direct
 * PATCHes to the field are silently stripped. The condition covers UX; the
 * access guard is the security boundary.
 */
export const adminOnlyCondition: Condition = (_data, _siblingData, { user }) => isAdminManager(user)

/**
 * Field-level access: the row's own holder, or an admin manager.
 *
 * A different question from `managersOnlyFieldAccess`, which asks which
 * collection the caller comes from. This one asks whether the caller **is** the
 * row, and it is what narrows `atlas-manager`'s collection-wide
 * `managers: read` grant — a picker needs the title, not a colleague's phone
 * number (#908). See `docs/rules/access.md`.
 *
 * ⚠ **The row id arrives as `id` on a read and as `doc.id` on a permissions
 * check.** `afterRead` passes `id: doc.id`
 * (`payload/dist/fields/hooks/afterRead/promise.js`), but
 * `getEntityPermissions` calls `populateFieldPermissions` with no `id` at all —
 * only the fetched row, as `doc`. Reading `id` alone would report every locked
 * field unreadable on a manager's own edit view, and `RenderFields` renders
 * nothing for a field it has no read permission on.
 *
 * ⚠ Neither is present on a create, or on the collection-level `/api/access`,
 * so it reads as admin-only in both. Intended: no field it guards is a
 * non-admin's to set.
 *
 * ⚠ **Spelled as an allowlist**, like `managersOnlyFieldAccess`, so a future
 * third auth collection arrives denied rather than exempt.
 */
export const selfOrAdminFieldAccess: FieldAccess = ({ doc, id, req: { user } }) => {
  if (isAdminManager(user)) return true
  if (!isManager(user)) return false
  return isOwnRow(user.id, id ?? doc?.id)
}

/**
 * Whether `rowId` is the row `userId` holds.
 *
 * One spelling of the coercion, because the two sides arrive differently
 * typed: a numeric `req.user.id` against an id REST parsed out of a path. An
 * unidentifiable row is never the caller's own.
 */
export function isOwnRow(userId: number | string, rowId: number | string | undefined): boolean {
  return rowId !== undefined && String(userId) === String(rowId)
}
