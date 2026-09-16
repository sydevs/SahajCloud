/**
 * Live-preview access: is this request allowed to read drafts?
 *
 * The admin panel opens a consumer site with a short-lived Ed25519 token on the
 * URL. The consumer forwards it back in `x-sahajcloud-preview-secret`, and a
 * request carrying a valid one unlocks drafts (`createAccessConfig`), is exempt
 * from the client `select`/`populate` gate and from per-client origin
 * enforcement, and is never cached.
 *
 * ⚠ **The verdict is resolved once, ahead of the gates that read it.**
 * Verifying a signature is asynchronous and three of the four readers are
 * synchronous, so `resolveLivePreviewHook` runs first in the `beforeOperation`
 * chain and stamps `req.context`. Payload awaits every `beforeOperation` hook
 * before it resolves access (`collections/operations/find.js`,
 * `globals/operations/findOne.js`), so the stamp is always present in time.
 *
 * ⚠ **Unstamped means no preview, never "not yet checked".** A path that
 * reaches a reader without the resolver having run — an internal `payload.find`
 * with `overrideAccess: false`, say — gets published content. Failing closed is
 * the only safe default for a flag whose job is to unlock drafts.
 */
import type { PayloadRequest } from 'payload'

import { serverEnv } from '@/lib/env'
import { verifyOwnLivePreviewToken } from '@/lib/livePreview/token'

/**
 * The header a consumer forwards its live-preview token in.
 *
 * ⚠ Mirrored in `src/plugins/cache/policy.ts` (which must stay Edge-safe and so
 * cannot import this module), in the Cloudflare Cache Rule, and in both
 * consumer repos. The name outlived the shared secret it used to carry, because
 * the Cache Rule and the CORS allowlist match on it and neither cares what the
 * value means.
 */
export const PREVIEW_SECRET_HEADER = 'x-sahajcloud-preview-secret'

/** Where the resolved verdict is stamped for the rest of the operation. */
const LIVE_PREVIEW_VERDICT = '__livePreviewVerified'

/**
 * Resolves the live-preview verdict for this request, once.
 *
 * ⚠ **Deliberately not `async`.** It is registered on every metered collection
 * and global operation, and virtually none of them carry the header, so the
 * common path returns before allocating a promise, touching `req.context` or
 * importing a key. Leaving that path unstamped is safe for the same reason an
 * unrun resolver is: {@link isLivePreviewRequest} treats absent as false.
 */
export function resolveLivePreviewHook({ req }: { req: PayloadRequest }): void | Promise<void> {
  const token = req.headers?.get?.(PREVIEW_SECRET_HEADER)
  if (!token) return

  const context = req.context as Record<string, unknown> | undefined
  if (!context || LIVE_PREVIEW_VERDICT in context) return

  return stampVerdict(context, token)
}

async function stampVerdict(context: Record<string, unknown>, token: string): Promise<void> {
  context[LIVE_PREVIEW_VERDICT] = await verifyOwnLivePreviewToken(
    token,
    serverEnv.LIVE_PREVIEW_SIGNING_KEY,
  )
}

/**
 * True when this request carries a live-preview token this service issued and
 * that has not expired.
 *
 * Synchronous by construction: it reads the verdict `resolveLivePreviewHook`
 * already stamped, and is the only reader of where that is kept.
 */
export function isLivePreviewRequest(req: PayloadRequest): boolean {
  return (req.context as Record<string, unknown> | undefined)?.[LIVE_PREVIEW_VERDICT] === true
}
