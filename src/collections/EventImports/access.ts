/**
 * Access for `event-imports` — the two operations the generated config gets wrong.
 *
 * ⚠ **An overridden key replaces the generated one rather than extending it**
 * (`src/collections/AGENTS.md`), so the admin → allow and `inactive` → deny
 * every other collection inherits from `bypassPermissions` do not run here.
 * `batchUploaderAccess` restates both below, because nothing else will.
 *
 * ⚠ **`create` and `delete` are deliberately NOT overridden.** No role names
 * this slug, implicit read is off (`RESTRICTED_COLLECTIONS`), and the
 * document-manager fallback covers read and update only — so the generated
 * config already answers both with "admins only", which is the rule.
 */

import type { Access } from 'payload'

import { isAdminManager } from '@/plugins/access'

/**
 * A batch belongs to the manager who uploaded it — read and update both answer
 * that, so they share one function. Another manager in the same region gets
 * nothing deliberately: a row holds the uploaded CSV verbatim, contact names,
 * phone numbers and emails included.
 *
 * Update is what a discard rides on, since trashing is a write to `deletedAt`.
 * Hard delete stays with the admins and the purge job, or a volunteer could
 * empty the trash that the seven-day window exists to let them undo.
 */
export const batchUploaderAccess: Access = ({ req: { user } }) => {
  if (isAdminManager(user)) return true
  if (user?.collection !== 'managers' || user.type === 'inactive') return false
  return { uploader: { equals: user.id } }
}
