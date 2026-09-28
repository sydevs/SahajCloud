import { serverEnv } from '@/lib/env'
import type { PreviewSecretExchange } from '@/plugins/login'


import { previewAdminEmail } from './seedPreviewAdmin'
import { shouldSeedPreviewAdminHere } from './shouldSeedPreviewAdmin'

/**
 * The credential `loginPlugin` should wire `exchange-preview-secret` for, or
 * `undefined` where there should be no such route.
 *
 * ⚠ **The same gate that provisions the account.** The secret is already a
 * working admin credential on every preview it is set for, so trading it for a
 * session is risk parity rather than a new risk — and anywhere the gate says no
 * (production, CI, local dev, a preview forked before the variable existed) the
 * route is never built.
 *
 * ⚠ **Read once, by the composition root.** `src/payload.config.ts` and the
 * test harness both call this when they construct the plugin. `loginPlugin`
 * itself knows nothing about Railway, and a per-request read would turn the
 * gate into a branch inside the handler.
 */
export const previewSecretExchange = (): PreviewSecretExchange | undefined => {
  const password = serverEnv.PREVIEW_ADMIN_PASSWORD
  if (!shouldSeedPreviewAdminHere() || !password) return undefined
  return { email: previewAdminEmail(), password }
}
