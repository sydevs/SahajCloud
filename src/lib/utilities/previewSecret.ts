/**
 * Live-preview secret check.
 *
 * The admin live-preview iframe loads the external We Meditate Web frontend
 * with the shared `SAHAJCLOUD_PREVIEW_SECRET`. That frontend fetches draft
 * content back from this CMS as an API client, forwarding the secret in the
 * `x-sahajcloud-preview-secret` header. A request carrying the valid secret is
 * a trusted preview request: it unlocks drafts (see `createAccessConfig`) and
 * is exempt from the client `select`/`populate` gate (see
 * `validateClientQueryParamsHook`).
 */
import type { PayloadRequest } from 'payload'

import { serverEnv } from '@/lib/env'

export const PREVIEW_SECRET_HEADER = 'x-sahajcloud-preview-secret'

/** True when the request carries the valid live-preview secret header. */
export function hasValidPreviewSecret(req: PayloadRequest): boolean {
  const secret = req.headers?.get?.(PREVIEW_SECRET_HEADER)
  return !!secret && secret === serverEnv.SAHAJCLOUD_PREVIEW_SECRET
}
