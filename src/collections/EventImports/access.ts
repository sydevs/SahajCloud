/**
 * Access for `event-imports` — the three operations the generated config gets wrong.
 *
 * ⚠ **An overridden key replaces the generated one rather than extending it**
 * (`src/collections/AGENTS.md`), so the admin → allow and `inactive` → deny
 * every other collection inherits from `bypassPermissions` do not run here.
 * `batchUploaderAccess` restates both below, because nothing else will.
 *
 * ⚠ **`create` is deliberately NOT overridden.** No role names this slug,
 * implicit read is off (`RESTRICTED_COLLECTIONS`), and the document-manager
 * fallback covers read and update only — so the generated config already answers
 * it with "admins only", which is the rule. A manager stages a batch through
 * `endpoints/upload.ts`, which elevates past this after checking the
 * `events: create` grant and the target's subtree — a stricter admission than a
 * role grant on this slug would be.
 */

import type { Access } from 'payload'

import { isAdminManager } from '@/plugins/access'

/**
 * A batch belongs to the manager who uploaded it — read and update both answer
 * that, so they share one function. Another manager in the same region gets
 * nothing deliberately: a row holds the uploaded CSV verbatim, contact names,
 * phone numbers and emails included.
 *
 * A discard is a write to `deletedAt`, so it needs `update` — and `delete` too,
 * which `batchDiscardAccess` below is for.
 */
export const batchUploaderAccess: Access = ({ req: { user } }) => {
  if (isAdminManager(user)) return true
  if (user?.collection !== 'managers' || user.type === 'inactive') return false
  return { uploader: { equals: user.id } }
}

/**
 * Who may discard a batch, and who may erase one.
 *
 * ⚠ **Trashing runs the `delete` check as well as `update`.** `updateByID`
 * detects a non-null `deletedAt` in the patch and calls `access.delete` with the
 * patch as `data` (`payload/dist/collections/operations/updateByID.js:110-118`),
 * combining the result into the update's own `where`. So an `update` grant alone
 * discards nothing: without this, the generated admins-only `delete` refused
 * every uploader their own discard, and the seven-day window had no
 * volunteer-reachable way in.
 *
 * ⚠ **Hard delete stays with the admins and the purge job.** The real `delete`
 * operation calls this with no `data`, so the `deletedAt` test refuses it — which
 * is the whole reason the test is on `data` rather than on the operation. A
 * volunteer who could empty their own trash is a volunteer who cannot undo a
 * discard, which is what the retention window exists for.
 */
export const batchDiscardAccess: Access = (args) => {
  if (isAdminManager(args.req.user)) return true
  if ((args.data as { deletedAt?: unknown } | undefined)?.deletedAt == null) return false
  return batchUploaderAccess(args)
}
