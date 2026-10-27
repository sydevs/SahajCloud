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
