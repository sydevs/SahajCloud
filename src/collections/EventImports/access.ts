/**
 * Access for `event-imports`.
 *
 * ⚠ **A collection's own `access` block replaces the generated one, bypass
 * included.** `accessPlugin` composes `{ ...createAccessConfig(slug), ...collection.access }`
 * (`docs/rules/access.md`), so these functions run *instead of* the role tables —
 * and the `inactive` → deny step every other collection inherits from
 * `bypassPermissions` never runs here. Each function below restates it, because
 * nothing else will.
 */

import type { Access } from 'payload'

import { isAdminManager } from '@/plugins/access'

/**
 * A batch belongs to the manager who uploaded it.
 *
 * Read, update and trash all answer that one question, so they share one
 * function. Another manager in the same region deliberately gets nothing: a row
 * holds the uploaded CSV verbatim, contact names, phone numbers and email
 * addresses included, and the review step is the uploader's own — a second
 * manager uploads their own file rather than inheriting a half-reviewed batch.
 */
export const batchUploaderAccess: Access = ({ req: { user } }) => {
  if (isAdminManager(user)) return true
  if (user?.collection !== 'managers' || user.type === 'inactive') return false
  return { uploader: { equals: user.id } }
}

/**
 * Create is admin-only, and the import does not use it.
 *
 * The Import tab's endpoints create a batch with `overrideAccess: true` after
 * checking subtree ownership themselves, so a grant here would only open a
 * second door that skips that check — a `POST /api/event-imports` naming any
 * `targetRegion` at all.
 */
export const batchCreateAccess: Access = ({ req: { user } }) => isAdminManager(user)
