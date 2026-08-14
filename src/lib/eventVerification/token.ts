import { createHmac, timingSafeEqual } from 'node:crypto'

import { DAY_MS } from '@/lib/utilities/time'

/**
 * Tokenized verify-link signing.
 *
 * The reminder email's "Verify" link must work while logged out, so it carries
 * a self-contained HMAC token over `{ eventId, managerId, exp }`, signed with
 * the Payload `secret`. The endpoint re-derives the signature and checks expiry
 * — no server-side token store. 10-day expiry matches the longest reminder
 * spacing so a link stays valid across a full escalation cycle.
 *
 * Format: `<base64url(json claims)>.<base64url(hmac-sha256)>`. Pure (the clock
 * is injected) so it unit-tests without env or Payload.
 */

export const VERIFY_TOKEN_TTL_MS = 10 * DAY_MS

export interface VerifyTokenClaims {
  eventId: number
  managerId: number
}

interface SignedClaims extends VerifyTokenClaims {
  /** Expiry, epoch milliseconds. */
  exp: number
}

function hmac(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url')
}

/** Sign a verify-link token. `now` is injectable for deterministic tests. */
export function signVerifyToken(
  claims: VerifyTokenClaims,
  secret: string,
  now: Date = new Date(),
): string {
  const body: SignedClaims = {
    eventId: claims.eventId,
    managerId: claims.managerId,
    exp: now.getTime() + VERIFY_TOKEN_TTL_MS,
  }
  const payloadB64 = Buffer.from(JSON.stringify(body)).toString('base64url')
  return `${payloadB64}.${hmac(payloadB64, secret)}`
}

/**
 * Outcome of inspecting a verify-link token.
 * - `valid` — signature matches and it hasn't expired (carries the claims).
 * - `expired` — signature matches but the token is past its TTL (an authentic,
 *   aged link — callers may show a friendly "link expired" message).
 * - `invalid` — missing / malformed / tampered / bad signature (treat as 404).
 */
export type VerifyTokenResult =
  | { status: 'valid'; claims: VerifyTokenClaims }
  | { status: 'expired' }
  | { status: 'invalid' }

/**
 * Inspect a verify-link token, distinguishing an authentic-but-expired token
 * from a missing/tampered one. The signature must validate before we trust the
 * `exp` claim, so only a genuine link can ever be reported `expired`. `now` is
 * injectable for tests.
 */
export function readVerifyToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): VerifyTokenResult {
  if (typeof token !== 'string') return { status: 'invalid' }
  const [payloadB64, signature] = token.split('.')
  if (!payloadB64 || !signature) return { status: 'invalid' }

  // Constant-time signature comparison (lengths must match first).
  const expected = Buffer.from(hmac(payloadB64, secret))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { status: 'invalid' }
  }

  let claims: SignedClaims
  try {
    claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as SignedClaims
  } catch {
    return { status: 'invalid' }
  }

  if (typeof claims.eventId !== 'number' || typeof claims.managerId !== 'number') {
    return { status: 'invalid' }
  }
  // Signature is authentic from here — an aged link is `expired`, not `invalid`.
  if (typeof claims.exp !== 'number' || claims.exp < now.getTime()) {
    return { status: 'expired' }
  }

  return { status: 'valid', claims: { eventId: claims.eventId, managerId: claims.managerId } }
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
