import { errors, jwtVerify, SignJWT } from 'jose'

/**
 * Signed, self-contained tokens for logged-out email links — a JWT (HS256)
 * over the Payload `secret`, with no server-side store.
 *
 * **The crypto is `jose`'s, not ours.** This module used to hand-roll HMAC,
 * base64url and a timing-safe compare, and by the time three link types wanted
 * one there were three copies of it. `jose` is already in the tree as Payload's
 * own dependency — it signs the auth JWTs — so this is the primitive the
 * framework already trusts, and pinning to the same version keeps one copy in
 * the install.
 *
 * What that buys beyond deleting code: the algorithm is pinned on verify, so a
 * token can't talk us into `none` or into an asymmetric alg; `exp` is checked
 * by the library against an injectable clock; and an authentic-but-aged token
 * raises a distinct error, which is what lets a caller say "this link expired"
 * rather than "this link is wrong".
 *
 * `kind` is carried as the JWT **audience**, which `jwtVerify` checks natively.
 * A token minted for one link type therefore cannot be replayed against
 * another — the verification fails before any claim is read.
 */

/** The only algorithm signed or accepted. Pinned on both sides. */
const ALGORITHM = 'HS256'

export interface SignedTokenOptions {
  /** Discriminates link types (the JWT audience); verification requires a match. */
  kind: string
  /**
   * Lifetime, or `null` for a token that never expires.
   *
   * Never-expiring is right for a narrow, idempotent action whose link may be
   * clicked arbitrarily late — the reminder unsubscribe link is the case: it
   * can only ever unsubscribe the one registration named in its signed claims,
   * doing so twice is a no-op, and an expiry would break legitimate links
   * months into a course while preventing nothing.
   */
  ttlMs: number | null
}

export type SignedTokenResult<T> =
  | { status: 'valid'; claims: T }
  | { status: 'expired' }
  | { status: 'invalid' }

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

/** Sign claims into a token. `now` is injectable for deterministic tests. */
export async function signToken(
  claims: Record<string, unknown>,
  options: SignedTokenOptions,
  secret: string,
  now: Date = new Date(),
): Promise<string> {
  const token = new SignJWT(claims)
    .setProtectedHeader({ alg: ALGORITHM })
    .setAudience(options.kind)
    .setIssuedAt(now)

  if (options.ttlMs !== null) {
    token.setExpirationTime(new Date(now.getTime() + options.ttlMs))
  }

  return token.sign(key(secret))
}

/**
 * Verify a token's signature, audience and expiry. The claims are returned
 * as-parsed — the caller narrows them (they were self-signed, so the shape is
 * trusted once the signature checks out).
 *
 * Every failure but expiry collapses to `invalid` on purpose: a tampered
 * signature, a wrong audience and a malformed token are the same event to a
 * reader, and distinguishing them in a response would describe our checks to
 * whoever is probing them.
 */
export async function verifyToken<T = Record<string, unknown>>(
  token: string | null | undefined,
  kind: string,
  secret: string,
  now: Date = new Date(),
): Promise<SignedTokenResult<T>> {
  if (!token) return { status: 'invalid' }

  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: [ALGORITHM],
      audience: kind,
      currentDate: now,
    })
    return { status: 'valid', claims: payload as T }
  } catch (error) {
    // Authentic but aged — the signature and audience passed, only the clock
    // didn't. Callers show a "this link expired" card rather than a 404.
    if (error instanceof errors.JWTExpired) return { status: 'expired' }
    return { status: 'invalid' }
  }
}
