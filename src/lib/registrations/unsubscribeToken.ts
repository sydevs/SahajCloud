import { createHmac, timingSafeEqual } from 'node:crypto'

import { signToken, verifyToken } from '@/lib/utilities/signedToken'

/**
 * Signed unsubscribe-link token.
 *
 * A session-reminder email's "Unsubscribe" link must work while logged out, so
 * it carries a self-contained HMAC token over `{ registrationId }`, signed with
 * the Payload `secret`. The page re-derives the signature — no server-side
 * token store.
 *
 * **No expiry.** A reminder link may be clicked weeks into a multi-month
 * course, long after any reasonable TTL. The action it authorizes is narrow and
 * idempotent — it only ever unsubscribes the one registration named in the
 * (signed, unforgeable) claims, and doing so twice is a no-op — so a replayed
 * or aged link can't cause harm, while an expiry would break legitimate links
 * and prevent nothing. `ttlMs: null` in the shared helper is that choice.
 *
 * The crypto lives in `@/lib/utilities/signedToken`; this module is the kind
 * and the claim shape.
 */

const UNSUBSCRIBE_TOKEN_KIND = 'registration-unsubscribe'

export interface UnsubscribeTokenClaims {
  registrationId: number
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

/** Sign an unsubscribe-link token for a registration. */
export function signUnsubscribeToken(claims: UnsubscribeTokenClaims, secret: string): string {
  return signToken(
    { registrationId: claims.registrationId },
    { kind: UNSUBSCRIBE_TOKEN_KIND, ttlMs: null },
    secret,
  )
}

/**
 * Inspect an unsubscribe-link token, validating its HMAC signature. The
 * signature must match before the claims are trusted, so a tampered id (a
 * different registration) is rejected as `invalid`.
 */
export function readUnsubscribeToken(
  token: string | null | undefined,
  secret: string,
): UnsubscribeTokenResult {
  const result = verifyToken<UnsubscribeTokenClaims>(token, UNSUBSCRIBE_TOKEN_KIND, secret)
  if (result.status === 'valid' && typeof result.claims.registrationId === 'number') {
    return { status: 'valid', claims: { registrationId: result.claims.registrationId } }
  }
  return readLegacyToken(token, secret)
}

/**
 * Tokens minted before these three link types were folded onto one helper
 * carry their claims flat, with no `kind` envelope.
 *
 * **This is the one place backwards compatibility is kept, and deliberately.**
 * These tokens never expire by design, so every reminder email ever sent still
 * holds a working one — and the thing they authorize is *stopping email*.
 * Someone who wants the reminders to stop and gets a 404 instead reports the
 * message as spam, which costs far more than fifteen lines. The verify link,
 * whose tokens lapse in ten days and whose action has an in-admin alternative,
 * dropped its old format outright.
 *
 * Nothing signs this shape any more, so it only ever shrinks in relevance.
 */
function readLegacyToken(token: string | null | undefined, secret: string): UnsubscribeTokenResult {
  if (typeof token !== 'string') return { status: 'invalid' }
  const [payloadB64, signature] = token.split('.')
  if (!payloadB64 || !signature) return { status: 'invalid' }

  const expected = Buffer.from(createHmac('sha256', secret).update(payloadB64).digest('base64url'))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { status: 'invalid' }
  }

  try {
    const claims = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8'),
    ) as UnsubscribeTokenClaims
    return typeof claims.registrationId === 'number'
      ? { status: 'valid', claims: { registrationId: claims.registrationId } }
      : { status: 'invalid' }
  } catch {
    return { status: 'invalid' }
  }
}
