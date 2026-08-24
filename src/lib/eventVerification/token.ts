import { signToken, verifyToken, type SignedTokenResult } from '@/lib/utilities/signedToken'

/**
 * Tokenized verify-link signing.
 *
 * The reminder email's "Verify" link must work while logged out, so it carries
 * a self-contained HMAC token over `{ eventId, managerId }`, signed with the
 * Payload `secret` — no server-side token store. 10-day expiry matches the
 * longest reminder spacing so a link stays valid across a full escalation
 * cycle.
 *
 * The crypto lives in `@/lib/utilities/signedToken`; this module is just the
 * kind, the TTL, and the claim shape. It used to hand-roll the same HMAC as
 * the unsubscribe and feedback links — three copies of one construction, which
 * is three places for a signature bug to hide.
 *
 * **The wire format changed with that consolidation** (claims are now nested
 * under a `kind` envelope), so verify links minted beforehand no longer parse.
 * Deliberate: they live 10 days at most, and a manager whose link has lapsed
 * can still verify from the event's own admin banner. Unsubscribe links, which
 * never expire, kept a compatibility path for exactly the opposite reason.
 */

const VERIFY_TOKEN_KIND = 'event-verify'

export const VERIFY_TOKEN_TTL_MS = 10 * 24 * 60 * 60 * 1000 // 10 days

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
 * from a missing/tampered one. `now` is injectable for tests.
 */
export function readVerifyToken(
  token: string | null | undefined,
  secret: string,
  now: Date = new Date(),
): VerifyTokenResult {
  const result = verifyToken<VerifyTokenClaims>(token, VERIFY_TOKEN_KIND, secret, now)
  if (result.status !== 'valid') return result
  // The signature already proves we minted it; this only catches a token from
  // an older shape of these claims, which is malformed rather than expired.
  const { eventId, managerId } = result.claims
  if (typeof eventId !== 'number' || typeof managerId !== 'number') {
    return { status: 'invalid' }
  }
  return { status: 'valid', claims: { eventId, managerId } }
}

/**
 * Validate a verify-link token. Returns its claims when the signature matches
 * and it hasn't expired, else `null`. Thin wrapper over {@link readVerifyToken}
 * for callers that only need the authorize-or-reject decision.
 */
export function verifyVerifyToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): VerifyTokenClaims | null {
  const result = readVerifyToken(token, secret, now)
  return result.status === 'valid' ? result.claims : null
}
