import { serverEnv } from '@/lib/env'

/**
 * Get the server URL with the actual port that the application is running on
 * @returns The server URL (from env or constructed from PORT)
 */
export function getServerUrl(): string {
  // Prefer explicit environment variable
  if (serverEnv.SAHAJCLOUD_URL) {
    return serverEnv.SAHAJCLOUD_URL
  }

  // Use PORT environment variable (validated with default of 3000)
  const port = serverEnv.PORT
  return `http://localhost:${port}`
}

/**
 * The origins a cookie-authenticated request may come from: the configured
 * server URL, and the public domain this deployment is actually served on.
 *
 * ⚠ **A Railway PR preview inherits `SAHAJCLOUD_URL` from production**, so
 * without its own domain here every admin request from the preview carried an
 * `Origin` Payload's `csrf` list did not hold — the session cookie was ignored,
 * and each write (an upload, a save) answered 403 as an anonymous caller while
 * page loads, which send no `Origin`, kept working. Read off `process.env`
 * directly, like `deploymentEnvironment`: Railway injects it at runtime and no
 * schema describes it. Railway serves the domain over https only.
 */
export function ownOrigins(): string[] {
  const domain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim()
  return [...new Set([getServerUrl(), ...(domain ? [`https://${domain}`] : [])])]
}
