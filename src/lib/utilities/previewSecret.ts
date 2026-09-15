/**
 * Live-preview access: is this request allowed to read drafts?
 *
 * The admin panel opens a consumer site with a short-lived Ed25519 token on the
 * URL. The consumer forwards that token back here, in the
 * `x-sahajcloud-preview-secret` header, and a request carrying a valid one is a
 * trusted preview request: it unlocks drafts (`createAccessConfig`), is exempt
 * from the client `select`/`populate` gate and from per-client origin
 * enforcement (`validateClientQueryParamsHook`, `assertClientOriginAllowed`),
 * and is never cached (`publicReadCacheHeaders`).
 *
 * ## The token names a role, and the caller must hold it
 *
 * A token carries the API-client role that may redeem it. This hook matches it
 * against `req.user.roles` on the authenticated key, so a token minted for the
 * We Meditate Web client is refused when presented with the Sahaj Atlas key.
 *
 * ⚠ **That check is the reason the claim exists.** It first named the *site*
 * — `wm-web` / `sy-atlas` — which only the consumer checked, against a constant
 * it hardcoded, while this service accepted either. So a token leaked from one
 * surface unlocked drafts on both. A role is matched against something the
 * request proves.
 *
 * ## This replaced a shared secret
 *
 * The header used to carry `SAHAJCLOUD_PREVIEW_SECRET` verbatim, and that value
 * also rode in the panel's URL. A URL is read by browser history, `Referer`,
 * Sentry session replay, and an analytics script that posts `location.href` —
 * so a long-lived symmetric secret sat permanently exposed. And a public bundle
 * like the atlas widget could never be given it to verify with, because holding
 * it means being able to mint it.
 *
 * The header name is unchanged on purpose. It is matched by the Cloudflare
 * Cache Rule and listed in the CORS allowlist, and neither cares what the value
 * means. Only what counts as valid changed.
 *
 * ## Why the verdict is resolved once, ahead of the readers
 *
 * Verifying an Ed25519 signature is asynchronous. Three of the four readers are
 * synchronous — `validateClientQueryParamsHook`, `assertClientOriginAllowed`
 * and `publicReadCacheHeaders` — and making them async would ripple through a
 * security-critical path for no gain.
 *
 * So `resolveLivePreviewHook` runs first in the `beforeOperation` chain, does
 * the one await, and stamps the answer on `req.context`. Payload awaits every
 * `beforeOperation` hook before it resolves access — `collections/operations/
 * find.js` and `globals/operations/findOne.js` both do — so the stamp is always
 * present by the time anything reads it.
 *
 * ⚠ **Absent means no preview, never "not yet checked".** A code path that
 * reaches a reader without the resolver having run — an internal
 * `payload.find` with `overrideAccess: false`, say — sees `false` and gets
 * published content. Failing closed is the only safe default for a flag whose
 * job is to unlock drafts.
 */
import type { PayloadRequest } from 'payload'

import { serverEnv } from '@/lib/env'
import { verifyOwnLivePreviewToken } from '@/lib/livePreview/token'

/**
 * The header a consumer forwards its live-preview token in.
 *
 * Mirrored in `src/plugins/cache/policy.ts` (which must stay Edge-safe and so
 * cannot import this module), in the Cloudflare Cache Rule, and in both
 * consumer repos.
 */
export const PREVIEW_SECRET_HEADER = 'x-sahajcloud-preview-secret'

/** Where the resolved verdict is stamped for the rest of the operation. */
const LIVE_PREVIEW_VERDICT = '__livePreviewVerified'

/**
 * Resolves the live-preview verdict for this request, once.
 *
 * Registered first in the `beforeOperation` chain, ahead of every gate that
 * reads it. Never throws: an unverifiable token is simply not a preview.
 */
export async function resolveLivePreviewHook({ req }: { req: PayloadRequest }): Promise<void> {
  if (req.context && LIVE_PREVIEW_VERDICT in req.context) return

  const token = req.headers?.get?.(PREVIEW_SECRET_HEADER)
  const role = token
    ? await verifyOwnLivePreviewToken(token, serverEnv.LIVE_PREVIEW_SIGNING_KEY)
    : null

  // A token this service issued, presented by a key that holds the role it
  // names. Both halves are required: the signature proves origin, the role
  // match proves the holder is the consumer it was minted for.
  //
  // `roles` is only ever a flat array on a client — the per-locale map shape in
  // `TypedAuthUser` belongs to managers, and a manager never carries this
  // header — so an array check is the whole narrowing needed.
  const roles = (req.user as { roles?: unknown } | undefined)?.roles
  const holdsRole = role !== null && Array.isArray(roles) && roles.includes(role)

  if (req.context) {
    ;(req.context as Record<string, unknown>)[LIVE_PREVIEW_VERDICT] = holdsRole
  }
}

/**
 * True when this request carries a live-preview token this service issued and
 * that has not expired.
 *
 * Synchronous by construction — it reads the verdict `resolveLivePreviewHook`
 * already stamped. See this module's docblock for why that matters.
 */
export function hasValidPreviewSecret(req: PayloadRequest): boolean {
  return (req.context as Record<string, unknown> | undefined)?.[LIVE_PREVIEW_VERDICT] === true
}
