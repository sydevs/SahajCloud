import type { APIRequestContext } from '@playwright/test'

/**
 * Preview admin credentials.
 *
 * These authenticate against a deployed Railway PR preview (`PREVIEW_URL`), not
 * just localhost, so the secret is a real one and comes from CI secrets — never
 * from source. `password` is a getter so importing this module stays safe for
 * specs that never sign in. The throw lands at first use with a message that
 * says what to set, instead of surfacing as an opaque 403.
 *
 * ⚠ **`password` is no longer a manager's password.** Managers hold none since
 * sydevs/SahajCloud#840; this value is the secret the preview-only exchange
 * route below trades for a session.
 */
export const PREVIEW_ADMIN = {
  email: process.env.PREVIEW_ADMIN_EMAIL ?? 'contact@sydevelopers.com',
  get password(): string {
    const password = process.env.PREVIEW_ADMIN_PASSWORD
    if (!password) {
      throw new Error(
        'PREVIEW_ADMIN_PASSWORD is not set. Preview credentials come from CI secrets — set it in ' +
          'the workflow env before running the preview specs.',
      )
    }
    return password
  },
}

export function getBaseUrl(): string {
  return process.env.PREVIEW_URL ?? 'http://localhost:3000'
}

/**
 * The preview-only route that trades `PREVIEW_ADMIN_PASSWORD` for a session.
 *
 * ⚠ **Kept in step with `EXCHANGE_PREVIEW_SECRET_PATH` by hand.** The specs run
 * over HTTP against a deployed preview, so they import nothing from `src/`.
 */
const EXCHANGE_PATH = '/api/managers/exchange-preview-secret'

/**
 * Sign in to the preview as the admin and return a JWT.
 *
 * **This is an exchange and nothing more.** The admin is provisioned by the deploy itself
 * — `onInit` reconciles it on every boot of a preview environment
 * (`src/plugins/previewAdmin`, sydevs/SahajCloud#662) — so by the time any spec runs, the
 * account already exists, accepted and admin.
 *
 * It used to `POST /api/managers/login`. Managers hold no password since
 * sydevs/SahajCloud#840, so that route is now `Forbidden` for everyone; the exchange
 * route authenticates the secret against the environment instead, and exists only where
 * the same gate provisions the account. **No new CI secret** — it is the
 * `PREVIEW_ADMIN_PASSWORD` the workflow already passes.
 *
 * A failure here is therefore a real one — the deploy did not seed, the exchange route
 * is not wired because the preview holds no secret, or this run holds a different value
 * than the deploy did — so it is reported rather than worked around.
 */
export async function ensureAdmin(request: APIRequestContext): Promise<string> {
  const res = await request.post(EXCHANGE_PATH, { data: PREVIEW_ADMIN })
  if (!res.ok()) {
    throw new Error(
      `ensureAdmin: ${PREVIEW_ADMIN.email} could not exchange the preview secret at ` +
        `${getBaseUrl()}${EXCHANGE_PATH} (${res.status()}). The preview provisions its admin ` +
        'on every deploy and wires this route from the same PREVIEW_ADMIN_PASSWORD, so ' +
        'either that deploy step did not run — check the boot log for a [previewAdmin] ' +
        'line — or this run holds a different value than the deploy did.',
    )
  }
  const body = (await res.json()) as { token?: string }
  if (!body.token) {
    throw new Error('ensureAdmin: the exchange succeeded but the response carried no token')
  }
  return body.token
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `JWT ${token}` }
}
