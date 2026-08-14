import type { SignedTokenResult } from '@/lib/utilities/signedToken'
import { signToken, verifyToken } from '@/lib/utilities/signedToken'
import { DAY_MS } from '@/lib/utilities/time'

/**
 * Tokenized verify-link signing.
 *
 * The reminder email's "Verify" link must work while logged out, so it carries
 * a self-contained HMAC token naming the event and the manager it was sent to.
 * The endpoint re-derives the signature and checks expiry — no server-side
 * token store. 10-day expiry matches the longest reminder spacing so a link
 * stays valid across a full escalation cycle.
 *
 * The crypto itself lives in `@/lib/utilities/signedToken`; this module is just
 * the event-verify *kind* — its claims, its TTL, and the `null`-returning
 * wrapper its callers want.
 */

export const VERIFY_TOKEN_TTL_MS = 10 * DAY_MS

const VERIFY_TOKEN_KIND = 'event-verify'

export interface VerifyTokenClaims {
  eventId: number
  managerId: number
}

/**
 * Outcome of inspecting a verify-link token.
 * - `valid` — signature matches and it hasn't expired (carries the claims).
 * - `expired` — signature matches but the token is past its TTL (an authentic,
 *   aged link — callers may show a friendly "link expired" message).
 * - `invalid` — missing / malformed / tampered / bad signature (treat as 404).
 */
export type VerifyTokenResult = SignedTokenResult<VerifyTokenClaims>

/** Sign a verify-link token. `now` is injectable for deterministic tests. */
export function signVerifyToken(
  claims: VerifyTokenClaims,
  secret: string,
  now: Date = new Date(),
): string {
  return signToken(
    { eventId: claims.eventId, managerId: claims.managerId },
    { kind: VERIFY_TOKEN_KIND, ttlMs: VERIFY_TOKEN_TTL_MS },
    secret,
    now,
  )
}

/**
 * Inspect a verify-link token, distinguishing an authentic-but-expired token
 * from a missing/tampered one. The signature must validate before the `exp`
 * claim is trusted, so only a genuine link can ever be reported `expired`.
 * `now` is injectable for tests.
 */
export function readVerifyToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): VerifyTokenResult {
  return verifyToken<VerifyTokenClaims>(token, VERIFY_TOKEN_KIND, secret, now)
}

/**
 * Validate a verify-link token. Returns its claims when the signature matches
 * and it hasn't expired, else `null`. Thin wrapper over {@link readVerifyToken}
 * for callers that only need the authorize-or-reject decision. `now` is
 * injectable for tests.
 */
export function verifyVerifyToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): VerifyTokenClaims | null {
  const result = readVerifyToken(token, secret, now)
  return result.status === 'valid' ? result.claims : null
}
