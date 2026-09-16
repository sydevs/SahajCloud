import { getServerUrl } from '@/lib/utilities/serverUrl'
import { signToken, verifyToken, type SignedTokenResult } from '@/lib/utilities/signedToken'

/**
 * Tokenized links for the post-event feedback page — "did this class take
 * place?". The token proves the email recipient owns the registration; the
 * page (SahajCloud-hosted, `/registrations/feedback`) writes the vote through
 * the normal `user-submissions` update path, so the gate + sync hooks apply.
 */

// ⚠ **The kind is versioned because the claim changed shape.** It used to
// carry a `registrations` row id; it now carries a `user-submissions` one, and
// the same integer addresses an unrelated row in the new table. `verifyFeedbackToken`
// casts without checking the claim, so a rename alone would send `undefined`
// to `findByID` rather than refusing. A new kind refuses at the signature.
const FEEDBACK_TOKEN_KIND = 'submission-feedback'

/** 30 days — a follow-up may sit unread; the vote gate re-checks the event anyway. */
export const FEEDBACK_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface FeedbackTokenClaims {
  submissionId: number
}

export function signFeedbackToken(
  claims: FeedbackTokenClaims,
  secret: string,
  now: Date = new Date(),
): Promise<string> {
  return signToken(
    { submissionId: claims.submissionId },
    { kind: FEEDBACK_TOKEN_KIND, ttlMs: FEEDBACK_TOKEN_TTL_MS },
    secret,
    now,
  )
}

export function verifyFeedbackToken(
  token: string | null | undefined,
  secret: string,
  now: Date = new Date(),
): Promise<SignedTokenResult<FeedbackTokenClaims>> {
  return verifyToken<FeedbackTokenClaims>(token, FEEDBACK_TOKEN_KIND, secret, now)
}

/** Absolute URL of the feedback page, with the vote preselected for the email button. */
export function buildFeedbackEmailLink(token: string, vote?: 'confirmed' | 'denied'): string {
  const params = new URLSearchParams({ token })
  if (vote) params.set('vote', vote)
  return `${getServerUrl()}/registrations/feedback?${params.toString()}`
}
