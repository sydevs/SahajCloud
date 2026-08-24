import { getServerUrl } from '@/lib/utilities/serverUrl'
import { signToken, verifyToken, type SignedTokenResult } from '@/lib/utilities/signedToken'

/**
 * Tokenized links for the post-event feedback page — "did this class take
 * place?". The token proves the email recipient owns the registration; the
 * page (SahajCloud-hosted, `/registrations/feedback`) writes the vote through
 * the normal Registrations update path, so the gate + sync hooks apply.
 */

const FEEDBACK_TOKEN_KIND = 'registration-feedback'

/** 30 days — a follow-up may sit unread; the vote gate re-checks the event anyway. */
export const FEEDBACK_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface FeedbackTokenClaims {
  registrationId: number
}

export function signFeedbackToken(
  claims: FeedbackTokenClaims,
  secret: string,
  now: Date = new Date(),
): Promise<string> {
  return signToken(
    { ...claims },
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
