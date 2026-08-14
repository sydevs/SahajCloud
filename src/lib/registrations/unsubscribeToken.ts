import type { SignedTokenResult } from '@/lib/utilities/signedToken'
import { signToken, verifyToken } from '@/lib/utilities/signedToken'

/**
 * Signed unsubscribe-link token.
 *
 * A session-reminder email's "Unsubscribe" link must work while logged out, so
 * it carries a self-contained HMAC token naming the registration to
 * unsubscribe. The page re-derives the signature — no server-side token store.
 * The crypto lives in `@/lib/utilities/signedToken`; this module is the
 * unsubscribe *kind*.
 *
 * **No expiry** (`ttlMs: null`). A reminder link may be clicked weeks into a
 * multi-month course, long after any reasonable TTL. The action it authorizes
 * is narrow and idempotent — it only ever unsubscribes the one registration
 * named in the (signed, unforgeable) claims, and doing so twice is a no-op —
 * so a replayed or aged link can't cause harm, and an expiry would only break
 * legitimate links.
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
 * `expired` is in the union because it's the shared token result type, but
 * these tokens are signed with no expiry so it never occurs (see the module
 * note). Callers that switch on the status can treat it like `invalid`.
 */
export type UnsubscribeTokenResult = SignedTokenResult<UnsubscribeTokenClaims>

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
export function readUnsubscribeToken(token: string, secret: string): UnsubscribeTokenResult {
  return verifyToken<UnsubscribeTokenClaims>(token, UNSUBSCRIBE_TOKEN_KIND, secret)
}
