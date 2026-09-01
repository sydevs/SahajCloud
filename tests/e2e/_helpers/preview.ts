import type { APIRequestContext } from '@playwright/test'

/**
 * Preview admin credentials.
 *
 * These authenticate against a deployed Railway PR preview (`PREVIEW_URL`), not
 * just localhost, so the password is a real secret and comes from CI secrets —
 * never from source. `password` is a getter so importing this module stays safe
 * for specs that never log in; the throw lands at first use with a message that
 * says what to set, instead of surfacing as an opaque 401.
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

export async function loginAsAdmin(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/managers/login', { data: PREVIEW_ADMIN })
  if (!res.ok()) {
    throw new Error(`login failed: ${res.status()} ${await res.text()}`)
  }
  const body = (await res.json()) as { token?: string }
  if (!body.token) {
    throw new Error('login response missing token')
  }
  return body.token
}

/**
 * Log in to the preview as the admin and return a JWT.
 *
 * **This is a login and nothing more.** The admin is provisioned by the deploy itself —
 * `onInit` reconciles it from `PREVIEW_ADMIN_PASSWORD` on every boot of a preview
 * environment (`src/plugins/previewAdmin`, sydevs/SahajCloud#662) — so by the time any
 * spec runs, an account matching the current secret already exists.
 *
 * It used to bootstrap the account itself via Payload's `first-register`, which succeeds
 * only while the auth collection is empty. That made the credential a property of the
 * preview *database* rather than of the current secret, and a preview's Postgres volume
 * outlives its deploys: rotating the secret orphaned every already-seeded environment,
 * because login then failed on the new value while `first-register` stayed Forbidden.
 * Reconciling at deploy removes that whole class of failure, and with it the 403
 * special-case this function used to carry.
 *
 * A failure here is therefore a real one — the deploy did not seed, or the secret this
 * run holds is not the one the deploy used — so it is reported rather than worked around.
 */
export async function ensureAdmin(request: APIRequestContext): Promise<string> {
  const login = await request.post('/api/managers/login', { data: PREVIEW_ADMIN })
  if (!login.ok()) {
    throw new Error(
      `ensureAdmin: ${PREVIEW_ADMIN.email} could not log in to ${getBaseUrl()} ` +
        `(${login.status()}). The preview provisions its admin on every deploy from ` +
        'PREVIEW_ADMIN_PASSWORD, so either that deploy step did not run — check the boot log ' +
        'for a [previewAdmin] line — or this run holds a different value than the deploy did.',
    )
  }
  const body = (await login.json()) as { token?: string }
  if (!body.token) {
    throw new Error('ensureAdmin: login succeeded but the response carried no token')
  }
  return body.token
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `JWT ${token}` }
}
