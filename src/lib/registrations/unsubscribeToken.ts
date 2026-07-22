import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Signed unsubscribe-link token.
 *
 * A session-reminder email's "Unsubscribe" link must work while logged out, so
 * it carries a self-contained HMAC token over `{ registrationId }`, signed with
 * the Payload `secret`. The page re-derives the signature — no server-side token
 * store. Mirrors `eventVerification/token.ts`, with two deliberate differences:
 *
 * 1. **No expiry.** A reminder link may be clicked weeks into a multi-month
 *    course, long after any reasonable TTL. The action it authorizes is narrow
 *    and idempotent — it only ever unsubscribes the one registration named in
 *    the (signed, unforgeable) claims, and doing so twice is a no-op — so a
 *    replayed or aged link can't cause harm, and an expiry would only break
 *    legitimate links. Hence no `exp` claim and no clock.
 * 2. **Registration-scoped claims.** The token names a single registration, so
 *    a forged or altered id fails the signature check and can't affect another.
 *
 * Format: `<base64url(json claims)>.<base64url(hmac-sha256)>`. Pure, so it
 * unit-tests without env or Payload.
 */

export interface UnsubscribeTokenClaims {
  registrationId: number
}

function hmac(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

/** Sign an unsubscribe-link token for a registration. */
export function signUnsubscribeToken(claims: UnsubscribeTokenClaims, secret: string): string {
  const body: UnsubscribeTokenClaims = { registrationId: claims.registrationId }
  const payloadB64 = Buffer.from(JSON.stringify(body)).toString('base64url')
  return `${payloadB64}.${hmac(payloadB64, secret)}`
}

/**
 * Outcome of inspecting an unsubscribe-link token.
 * - `valid` — signature matches (carries the claims).
 * - `invalid` — missing / malformed / tampered / bad signature (treat as 404).
 *
 * There is no `expired` state: these tokens never expire (see the module note).
 */
export type UnsubscribeTokenResult =
  | { status: 'valid'; claims: UnsubscribeTokenClaims }
  | { status: 'invalid' }

/**
 * Inspect an unsubscribe-link token, validating its HMAC signature. The
 * signature must match before the claims are trusted, so a tampered id (a
 * different registration) is rejected as `invalid`.
 */
export function readUnsubscribeToken(token: string, secret: string): UnsubscribeTokenResult {
  if (typeof token !== 'string') return { status: 'invalid' }
  const [payloadB64, signature] = token.split('.')
  if (!payloadB64 || !signature) return { status: 'invalid' }

  // Constant-time signature comparison (lengths must match first).
  const expected = Buffer.from(hmac(payloadB64, secret))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { status: 'invalid' }
  }

  let claims: UnsubscribeTokenClaims
  try {
    claims = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8'),
    ) as UnsubscribeTokenClaims
  } catch {
    return { status: 'invalid' }
  }

  if (typeof claims.registrationId !== 'number') return { status: 'invalid' }
  return { status: 'valid', claims: { registrationId: claims.registrationId } }
}
