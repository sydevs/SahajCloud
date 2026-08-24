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
): string {
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
): SignedTokenResult<FeedbackTokenClaims> {
  return verifyToken<FeedbackTokenClaims>(token, FEEDBACK_TOKEN_KIND, secret, now)
}

/** Absolute URL of the feedback page, with the vote preselected for the email button. */
export function buildFeedbackEmailLink(token: string, vote?: 'confirmed' | 'denied'): string {
  const params = new URLSearchParams({ token })
  if (vote) params.set('vote', vote)
  return `${getServerUrl()}/registrations/feedback?${params.toString()}`
}

/** A doc's public `webUrl`, when it's populated and actually has one. */
function webUrlOf(doc: unknown): string | null {
  if (!doc || typeof doc !== 'object') return null
  const url = (doc as { webUrl?: unknown }).webUrl
  return typeof url === 'string' && url.length > 0 ? url : null
}

/**
 * Where to send the reader once their answer is recorded, so the last step of
 * a feedback email becomes a way back into Atlas rather than a dead end
 * (sydevs/SahajAtlasWeb#164). `?feedback=` is both the banner trigger over
 * there and the only marker that the visit came from a follow-up email.
 *
 * **A denial never lands on the event.** They have just said the class isn't
 * there, so showing them the listing is confusing — and if theirs was the
 * fifth denial, that vote has already unpublished it and `webUrl` is null,
 * because the field is publish-gated. Regions aren't (`requirePublished:
 * false` in `Regions.ts`), so the region page resolves either way.
 *
 * Pure, and takes already-loaded docs: the decision is the part worth pinning
 * in a test, and the read belongs to the caller.
 *
 * Returns null when nothing resolves — the caller keeps the reader on our own
 * confirmation card, which is also what happens until the Atlas half ships.
 */
export function feedbackDestination(args: {
  vote: 'confirmed' | 'denied'
  event: unknown
  region: unknown
}): string | null {
  const base =
    args.vote === 'confirmed' ? (webUrlOf(args.event) ?? webUrlOf(args.region)) : webUrlOf(args.region)
  if (!base) return null
  return `${base}${base.includes('?') ? '&' : '?'}feedback=${args.vote}`
}
