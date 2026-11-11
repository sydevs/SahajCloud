import { signToken, verifyToken } from '@/lib/utilities/signedToken'

/**
 * Signed calendar-feed token — the whole access control on
 * `GET /api/events/calendar/<token>.ics`.
 *
 * The feed is fetched server-side by Apple, Google and Microsoft, which carry no
 * API key, no `Origin` and no cookie, so the address itself has to be the
 * credential. Signing the event id with the Payload `secret` makes it
 * unguessable and unforgeable without storing anything: no column, no migration.
 *
 * **No expiry.** A subscription is re-fetched for as long as someone keeps the
 * calendar, which is exactly the "clicked arbitrarily late" case `ttlMs: null`
 * exists for.
 *
 * ⚠ **A stateless token cannot be withdrawn one at a time** — only by rotating
 * the Payload secret, which would invalidate every sign-in and unsubscribe link
 * too. Taking the class down is the per-class withdrawal: the feed then answers
 * `STATUS:CANCELLED` for 90 days so subscribed calendars clear it themselves.
 */

// ⚠ Versioned with the claim below — the integer addresses an `events` row.
// This module type-checks the claim, so a rename alone would fail closed; the
// kind refuses one commit earlier, at the signature.
const CALENDAR_TOKEN_KIND = 'event-calendar-feed'

export interface EventCalendarTokenClaims {
  eventId: number
}

/**
 * Outcome of inspecting a calendar-feed token.
 * - `valid` — signature and audience match (carries the claims).
 * - `invalid` — missing / malformed / tampered / wrong kind (answer 404).
 *
 * There is no `expired` state: these tokens never expire (see the module note).
 */
export type EventCalendarTokenResult =
  { status: 'valid'; claims: EventCalendarTokenClaims } | { status: 'invalid' }

/** Sign a calendar-feed token for one class. */
export function signEventCalendarToken(
  claims: EventCalendarTokenClaims,
  secret: string,
): Promise<string> {
  return signToken({ eventId: claims.eventId }, { kind: CALENDAR_TOKEN_KIND, ttlMs: null }, secret)
}

/**
 * Inspect a calendar-feed token. The signature must verify before the claims are
 * trusted, so a tampered id (a neighbouring class) is rejected as `invalid`.
 */
export async function readEventCalendarToken(
  token: string | null | undefined,
  secret: string,
): Promise<EventCalendarTokenResult> {
  const result = await verifyToken<EventCalendarTokenClaims>(token, CALENDAR_TOKEN_KIND, secret)
  return result.status === 'valid' && typeof result.claims.eventId === 'number'
    ? { status: 'valid', claims: { eventId: result.claims.eventId } }
    : { status: 'invalid' }
}
