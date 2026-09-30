import type { APIRequestContext } from '@playwright/test'

/**
 * The preview admin's address.
 *
 * ⚠ **The address is the credential.** Managers hold no password since
 * sydevs/SahajCloud#840, and a Railway preview signs this one address in on
 * request rather than mailing it a link (`src/plugins/previewAdmin`). So it comes
 * from CI secrets like the password before it, never from source, and the local
 * part must not be guessable — anyone who opens the preview and types it becomes
 * its admin.
 *
 * A getter, so importing this module stays safe for specs that never sign in. The
 * throw lands at first use with a message that says what to set, instead of
 * surfacing as an opaque refusal.
 */
export const PREVIEW_ADMIN = {
  get email(): string {
    const email = process.env.PREVIEW_ADMIN_EMAIL
    if (!email) {
      throw new Error(
        'PREVIEW_ADMIN_EMAIL is not set. Preview credentials come from CI secrets — set it in ' +
          'the workflow env before running the preview specs.',
      )
    }
    return email
  },
}

export function getBaseUrl(): string {
  return process.env.PREVIEW_URL ?? 'http://localhost:3000'
}

/**
 * The route that asks for a sign-in link — and, for the preview admin, answers
 * with the session instead of sending mail.
 *
 * ⚠ **Kept in step with `REQUEST_MAGIC_LINK_PATH` by hand.** The specs run over
 * HTTP against a deployed preview, so they import nothing from `src/`.
 */
const REQUEST_PATH = '/api/managers/request-magic-link'

/**
 * Sign in to the preview as the admin and return a JWT.
 *
 * **The deploy provisions the account** — `onInit` reconciles it on every boot of
 * a preview environment (`src/plugins/previewAdmin`, sydevs/SahajCloud#662) — so
 * by the time any spec runs it already exists, accepted and admin.
 *
 * It used to `POST /api/managers/login`, then a preview-only exchange route.
 * Neither exists now: `PREVIEW_ADMIN_EMAIL` is both the account and the way in,
 * and `issueMagicLink` mints the session where the preview gate holds.
 *
 * A failure here is a real one, so it is reported rather than worked around.
 */
export async function ensureAdmin(request: APIRequestContext): Promise<string> {
  const res = await request.post(REQUEST_PATH, { data: { email: PREVIEW_ADMIN.email } })
  if (!res.ok()) {
    throw new Error(
      `ensureAdmin: ${REQUEST_PATH} refused the request for ${PREVIEW_ADMIN.email} ` +
        `at ${getBaseUrl()} (${res.status()}).`,
    )
  }
  // ⚠ A missing token is the expected shape for every other address: the route
  // answers `{ ok: true }` and says nothing. Here it means the preview did not
  // recognise this address as its admin — a different PREVIEW_ADMIN_EMAIL than
  // the deploy holds, or a deploy whose [previewAdmin] boot line is missing.
  const body = (await res.json()) as { token?: string }
  if (!body.token) {
    throw new Error(
      `ensureAdmin: the preview accepted the request but signed nobody in. It provisions its ` +
        `admin from PREVIEW_ADMIN_EMAIL on every deploy and signs in that same address, so ` +
        `either that deploy step did not run — check the boot log for a [previewAdmin] line — ` +
        `or this run holds a different value than the deploy did.`,
    )
  }
  return body.token
}

export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `JWT ${token}` }
}
