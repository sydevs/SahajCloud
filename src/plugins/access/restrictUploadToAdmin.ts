import type { CollectionBeforeChangeHook } from 'payload'

import { APIError } from 'payload'

import { isAdminManager } from './adminOnly'

type RestrictUploadToAdminOptions = {
  /** Resource name used in the error message, e.g. 'audio file on a meditation'. */
  label: string
}

/**
 * Factory for a `beforeChange` hook that locks down an upload collection's file
 * binary on existing documents. The file payload isn't a field — a replacement
 * arrives via `req.file` and a removal as `data.filename === null` — so neither
 * can be guarded by per-field `access.update`; we enforce them here instead.
 *
 * - **Replacing** the file is restricted to admin managers. Trusted system/seed
 *   calls (`req.user == null`) and API clients pass through — they don't drive
 *   the admin upload UI, and clients lack write access on these collections.
 * - **Removing** the file without replacing it (clearing it to leave a fileless
 *   upload document) is never allowed, for any user — delete the whole document
 *   instead. A removal serializes as a strict `data.filename === null` with no
 *   `req.file` (the admin form uses `nullsAsUndefineds: false`), distinct from a
 *   partial update that merely omits `filename`.
 *
 * Applied to every upload collection. Do **not** set `hideRemoveFile` on these
 * collections: PayloadCMS's native Upload only lets you replace a file by first
 * removing it, so hiding the remove button would block replacement entirely.
 * The remove button stays visible; this hook is what enforces the policy.
 */
export const restrictUploadToAdmin =
  ({ label }: RestrictUploadToAdminOptions): CollectionBeforeChangeHook =>
  ({ data, operation, originalDoc, req }) => {
    if (operation !== 'update') return data
    if (!originalDoc?.filename) return data // no existing file to protect

    // Clearing the file leaves an invalid fileless upload document — never
    // allowed, for any user. Delete the document instead.
    if (!req.file && data?.filename === null) {
      throw new APIError(`The ${label} cannot be removed; delete the document instead.`, 403)
    }

    // Replacing the existing file is restricted to admin managers.
    if (req.file && req.user?.collection === 'managers' && !isAdminManager(req.user)) {
      throw new APIError(`Only admins can replace the ${label}.`, 403)
    }

    return data
  }
