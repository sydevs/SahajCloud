import { signToken, verifyToken, type SignedTokenResult } from '@/lib/utilities/signedToken'

/**
 * The two link types a manager can be sent, as signed tokens.
 *
 * The crypto lives in `@/lib/utilities/signedToken` (a `jose` JWT); this module
 * is the two kinds, their TTLs, and the claim shape.
 *
 * ⚠ **The kinds are separate audiences, and that separation is the security
 * property.** `verifyToken` checks the audience natively, before any claim is
 * read, so a 7-day invitation cannot be replayed as a sign-in and a sign-in
 * link cannot accept an invitation. Neither string may collide with
 * `event-verify`, `submission-feedback` or `submission-unsubscribe`, or the
 * link types stop being distinguishable — `tests/unit/login-token.spec.ts`
 * pins the whole set.
 *
 * ⚠ **These tokens are signed with `payload.secret`, the same key that signs
 * Payload's own session JWTs**, and `JWTAuthentication` pins neither an
 * algorithm nor an audience — it accepts any HS256 token under that secret.
 * A link token is refused as a session cookie only because it names the
 * subject `userId` rather than `id`, and carries no `sid` for the session
 * check `managers` inherits. Both are accidents of Payload's verifier, not
 * guarantees this module makes, so neither claim may be renamed to `id` and
 * no `sid` may be added here. `manager-magic-link.int.spec.ts` asserts the
 * refusal rather than trusting it.
 */

/** An emailed sign-in link. Short-lived: the holder asked for it seconds ago. */
const SIGNIN_TOKEN_KIND = 'manager-signin'

/** An emailed invitation to a manager who has never signed in. */
const INVITE_TOKEN_KIND = 'manager-invite'

export const SIGNIN_TOKEN_TTL_MS = 15 * 60 * 1000 // 15 minutes

export const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export interface LoginTokenClaims {
  /** The auth collection `userId` addresses. */
  collection: string
  /**
   * `magicLinkIssuedAt` as **epoch milliseconds**.
   *
   * ⚠ Numeric on purpose. Payload stores dates as `timestamp(3) with time
   * zone`, which holds exactly the millisecond `Date.now()` produces, so the
   * consume route can compare two numbers. Carrying an ISO rendering instead
   * would make single-use turn on string formatting.
   */
  issuedAt: number
  userId: number | string
}

export type LoginTokenResult = SignedTokenResult<LoginTokenClaims>

function sign(claims: LoginTokenClaims, kind: string, ttlMs: number, secret: string, now: Date) {
  return signToken({ ...claims }, { kind, ttlMs }, secret, now)
}

async function read(
  token: null | string | undefined,
  kind: string,
  secret: string,
  now: Date,
): Promise<LoginTokenResult> {
  const result = await verifyToken<LoginTokenClaims>(token, kind, secret, now)
  if (result.status !== 'valid') return result

  // The signature already proves we minted it; this only catches a token from
  // an older shape of these claims, which is malformed rather than expired.
  const { collection, issuedAt, userId } = result.claims
  if (typeof collection !== 'string' || typeof issuedAt !== 'number' || userId === undefined) {
    return { status: 'invalid' }
  }
  return { status: 'valid', claims: { collection, issuedAt, userId } }
}

/** Sign a sign-in link token. `now` is injectable for deterministic tests. */
export function signSigninToken(
  claims: LoginTokenClaims,
  secret: string,
  now: Date = new Date(),
): Promise<string> {
  return sign(claims, SIGNIN_TOKEN_KIND, SIGNIN_TOKEN_TTL_MS, secret, now)
}

/**
 * Inspect a sign-in link token, distinguishing an authentic-but-expired token
 * from a missing, tampered or wrong-audience one.
 */
export function readSigninToken(
  token: null | string | undefined,
  secret: string,
  now: Date = new Date(),
): Promise<LoginTokenResult> {
  return read(token, SIGNIN_TOKEN_KIND, secret, now)
}

/** Sign an invitation token. `now` is injectable for deterministic tests. */
export function signInviteToken(
  claims: LoginTokenClaims,
  secret: string,
  now: Date = new Date(),
): Promise<string> {
  return sign(claims, INVITE_TOKEN_KIND, INVITE_TOKEN_TTL_MS, secret, now)
}

/** Inspect an invitation token. See {@link readSigninToken}. */
export function readInviteToken(
  token: null | string | undefined,
  secret: string,
  now: Date = new Date(),
): Promise<LoginTokenResult> {
  return read(token, INVITE_TOKEN_KIND, secret, now)
}
