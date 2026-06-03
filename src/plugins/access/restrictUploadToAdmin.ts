import type { CollectionBeforeChangeHook } from 'payload'

import { APIError } from 'payload'

import { isAdminManager } from './adminOnly'

type RestrictUploadToAdminOptions = {
  /** Also block non-admin managers from clearing/removing the file. Default false. */
  blockRemoval?: boolean
  /** Resource name used in the error message, e.g. 'audio file on a meditation'. */
  label: string
}

/**
 * Factory for a `beforeChange` hook that blocks non-admin managers from
 * replacing (and optionally removing) an upload collection's file binary.
 *
 * Field-level `access.update` covers scalar fields, but the upload's file
 * payload isn't a field — a replacement arrives via `req.file`, and an
 * admin-UI removal arrives as `data.filename === null` (the form serializes
 * with `nullsAsUndefineds: false`, so a cleared upload is a strict `null`,
 * distinct from a partial update that simply omits `filename`). Neither can
 * be guarded by per-field access, so we reject the request in a hook before
 * the storage adapter runs.
 *
 * Scope: only human managers are gated. Trusted system/seed calls
 * (`req.user == null`) and API clients pass through — they don't drive the
 * admin upload UI, and clients lack write access on these collections anyway.
 *
 * Adopted by Meditations (audio, `blockRemoval: true`) and UserChoices (icon).
 */
export const restrictUploadToAdmin =
  ({ blockRemoval = false, label }: RestrictUploadToAdminOptions): CollectionBeforeChangeHook =>
  ({ data, operation, originalDoc, req }) => {
    if (operation !== 'update') return data
    // Only gate non-admin managers; system/seed (null user), clients, and admins pass through.
    if (req.user?.collection !== 'managers' || isAdminManager(req.user)) return data

    const hadFile = Boolean(originalDoc?.filename)
    const isReplacing = hadFile && Boolean(req.file)
    const isRemoving = blockRemoval && hadFile && !req.file && data?.filename === null

    if (isReplacing) {
      throw new APIError(`Only admins can replace the ${label}.`, 403)
    }
    if (isRemoving) {
      throw new APIError(`Only admins can remove the ${label}.`, 403)
    }

    return data
  }
