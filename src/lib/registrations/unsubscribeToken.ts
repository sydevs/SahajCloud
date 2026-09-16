import { signToken, verifyToken } from '@/lib/utilities/signedToken'

/**
 * Signed unsubscribe-link token.
 *
 * A session-reminder email's "Unsubscribe" link must work while logged out, so
 * it carries a self-contained token over `{ submissionId }`, signed with the
 * Payload `secret`. The page verifies the signature — no server-side store.
 *
 * **No expiry.** A reminder link may be clicked weeks into a multi-month
 * course, long after any reasonable TTL. The action it authorizes is narrow and
 * idempotent — it only ever unsubscribes the one submission named in the
 * (signed, unforgeable) claims, and doing so twice is a no-op — so a replayed
 * or aged link can't cause harm, while an expiry would break legitimate links
 * and prevent nothing. `ttlMs: null` in the shared helper is that choice.
 *
 * The crypto lives in `@/lib/utilities/signedToken`; this module is the kind
 * and the claim shape.
 */

// ⚠ Versioned with the claim below — the integer now addresses a
// `user-submissions` row. This module *does* type-check the claim, so a rename
// alone would fail closed; the new kind refuses one commit earlier, at the
// signature, and matches what `feedbackLinks` had to do.
const UNSUBSCRIBE_TOKEN_KIND = 'submission-unsubscribe'

export interface UnsubscribeTokenClaims {
  submissionId: number
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
export function signUnsubscribeToken(
  claims: UnsubscribeTokenClaims,
  secret: string,
): Promise<string> {
  return signToken(
    { submissionId: claims.submissionId },
    { kind: UNSUBSCRIBE_TOKEN_KIND, ttlMs: null },
    secret,
  )
}

/**
 * Inspect an unsubscribe-link token. The signature must verify before the
 * claims are trusted, so a tampered id (a different registration) is
 * rejected as `invalid`.
 */
export async function readUnsubscribeToken(
  token: string | null | undefined,
  secret: string,
): Promise<UnsubscribeTokenResult> {
  const result = await verifyToken<UnsubscribeTokenClaims>(token, UNSUBSCRIBE_TOKEN_KIND, secret)
  return result.status === 'valid' && typeof result.claims.submissionId === 'number'
    ? { status: 'valid', claims: { submissionId: result.claims.submissionId } }
    : { status: 'invalid' }
}
