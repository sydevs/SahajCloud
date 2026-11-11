import { serverEnv } from '@/lib/env'
import { railwayEnvironmentName } from '@/lib/env/deploymentEnvironment'
import { previewNumberFromEnvironmentName, previewOrigin } from '@/lib/preview/proxy'

/**
 * This deployment's own public URL: its fixed preview address on a Railway PR
 * preview, the configured server URL in production, and `localhost:PORT` with
 * neither.
 *
 * ⚠ **A Railway PR preview inherits `SAHAJCLOUD_URL` from production**, so
 * before the preview branch existed every link a preview composed — a sign-in
 * link, an unsubscribe, a feedback form — addressed the live site, and following
 * one left the preview. The preview's own fixed address is the honest answer,
 * and it is also the only one Cloudflare Access serves.
 */
export function getServerUrl(): string {
  const preview = previewServerUrl()
  if (preview) return preview

  // Prefer explicit environment variable
  if (serverEnv.SAHAJCLOUD_URL) {
    return serverEnv.SAHAJCLOUD_URL
  }

  // Use PORT environment variable (validated with default of 3000)
  const port = serverEnv.PORT
  return `http://localhost:${port}`
}

/**
 * The fixed `pr-<n>` address, on a Railway preview only.
 *
 * Read through `railwayEnvironmentName()`, the one module that knows Railway
 * sets two variables for this: no schema describes either, and reading only the
 * newer one answers `undefined` on an environment carrying only the legacy one.
 * The **name** decides, not `RAILWAY_PUBLIC_DOMAIN` — the same answer the gate
 * and the sign-in bypass read, so a deployment cannot compose links for an
 * address nothing serves it at.
 */
function previewServerUrl(): string | undefined {
  const pr = previewNumberFromEnvironmentName(railwayEnvironmentName())
  return pr ? previewOrigin(pr) : undefined
}

/**
 * The origins a cookie-authenticated request may come from: this deployment's
 * own public URL, and the Railway domain it is actually served on.
 *
 * ⚠ **Both entries are load-bearing on a preview, and the first one is new.**
 * Through the Worker a reviewer's browser sends `Origin:` the fixed address, so
 * without it here Payload's `csrf` list did not hold the origin — the session
 * cookie was ignored, and each write (an upload, a save) answered 403 as an
 * anonymous caller while page loads, which send no `Origin`, kept working.
 * Fixing `getServerUrl()` alone reproduces that 403 from the other side, which
 * is why the two changed together. CI's own fill is unaffected either way: a
 * bearer request carries no cookie and no `Origin`.
 */
export function ownOrigins(): string[] {
  const domain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim()
  return [...new Set([getServerUrl(), ...(domain ? [`https://${domain}`] : [])])]
}
