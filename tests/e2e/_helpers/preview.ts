import type { APIRequestContext } from '@playwright/test'

import { PREVIEW_ADMIN_ADDRESS } from '../../../src/lib/preview/proxy'

/**
 * The preview admin's address.
 *
 * ⚠ **It is no longer a credential**, and that is what changed in #1081. A
 * preview is reachable only through Cloudflare Access and the proxy gate, so who
 * may ask is settled before a request arrives — and the account is therefore a
 * committed constant rather than a CI secret. The credential this lane does hold
 * is the `github-ci` Access service token, which `playwright.config.ts` attaches
 * to every request.
 *
 * Imported, not copied: the specs import nothing from `src/` as a rule, and
 * `@/lib/preview/proxy` is the exception the rule allows — it is written with
 * zero imports of its own, so reading it pulls no module graph into the
 * Playwright process. A relative path, because Playwright resolves no `@/`.
 */
export const PREVIEW_ADMIN = { email: PREVIEW_ADMIN_ADDRESS }

export function getBaseUrl(): string {
  return process.env.PREVIEW_URL ?? 'http://localhost:3000'
}

/**
 * The route that asks for a sign-in link — and, on a preview, answers with the
 * session instead of sending mail.
 *
 * ⚠ **Kept in step with `REQUEST_MAGIC_LINK_PATH` by hand**, for the reason
 * above.
 */
export const REQUEST_PATH = '/api/managers/request-magic-link'

/**
 * Sign in to the preview as the admin and return a JWT.
 *
 * **The deploy provisions the account** — `onInit` reconciles it on every boot of
 * a preview environment (`src/plugins/previewAdmin`, sydevs/SahajCloud#662) — so
 * by the time any spec runs it already exists, accepted and admin. The admin is
 * what this lane signs in as because `/api/seed/<script>` admits nobody else,
 * even though a preview now signs in any manager.
 *
 * It used to `POST /api/managers/login`, then a preview-only exchange route.
 * Neither exists now: `issueMagicLink` mints the session wherever the preview
 * gate holds.
 *
 * A failure here is a real one, so it is reported rather than worked around.
 */
export async function ensureAdmin(request: APIRequestContext): Promise<string> {
  const res = await request.post(REQUEST_PATH, { data: { email: PREVIEW_ADMIN.email } })
  if (!res.ok()) {
    throw new Error(
      `ensureAdmin: ${REQUEST_PATH} refused the request for ${PREVIEW_ADMIN.email} ` +
        `at ${getBaseUrl()} (${res.status()}). A 302 to a Cloudflare Access login means this ` +
        `run holds no CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET, or the token's Service ` +
        `Auth policy was switched off.`,
    )
  }
  // ⚠ A missing token is the expected shape wherever the preview gate does not
  // hold: the route answers `{ ok: true }` and says nothing. Here it means this
  // deployment is not a Railway preview, or the admin account is missing or
  // unaccepted — the JWT strategy yields no user for an unaccepted account, so
  // `issueMagicLink` refuses rather than minting a token nobody can spend.
  const body = (await res.json()) as { token?: string }
  if (!body.token) {
    throw new Error(
      `ensureAdmin: the preview accepted the request but signed nobody in. Either this target ` +
        `is not a Railway preview environment, or the admin was never provisioned — check the ` +
        `boot log for a [previewAdmin] line.`,
    )
  }
  return body.token
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `JWT ${token}` }
}
