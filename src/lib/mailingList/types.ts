import type { Client } from '@/payload-types'

/** The `mailingList` group as it sits on a Clients document. */
export type MailingListConfig = NonNullable<Client['mailingList']>

/** The three providers this repo speaks. */
export const MAILING_LIST_PROVIDERS = ['mailchimp', 'brevo', 'klaviyo'] as const

export type MailingListProvider = (typeof MAILING_LIST_PROVIDERS)[number]

/**
 * What one subscribe attempt produced.
 *
 * The success arm carries the status the provider can actually **justify**,
 * which is why there are three of them rather than a boolean:
 *
 * - `subscribed` — the address is on the list now (Mailchimp with double
 *   opt-in off, Brevo always, and either provider for an address already there
 *   — idempotent, and it does not leak list membership).
 * - `pending` — accepted, and the provider is waiting on the person to confirm
 *   (Mailchimp with double opt-in on).
 * - `accepted` — **Klaviyo only.** Its subscribe job answers 202 with no
 *   per-profile result, so the adapter genuinely cannot tell "newly
 *   subscribed" from "already there" from "previously unsubscribed" inline.
 *   Naming the gap beats faking a `subscribed`. A caller must never read
 *   `accepted` as confirmation.
 *
 * The failure arm's `code` is what a caller branches on, and `retryable` is
 * what the delivery job branches on — a refused credential will be refused
 * identically on every retry, so only transport trouble earns another attempt.
 */
export type MailingListResult =
  | { ok: true; status: 'subscribed' | 'pending' | 'accepted' }
  | { ok: false; code: MailingListFailureCode; message: string; retryable: boolean }

export type MailingListFailureCode =
  /**
   * The address opted out, or sits in a provider compliance state.
   *
   * **Never resurrected.** Re-adding an address that unsubscribed is the single
   * fastest way to get a sender blocklisted, so this is terminal rather than
   * retryable, and the person re-subscribes from the provider's own email.
   * **Cannot arise on Klaviyo** — see `accepted` above.
   */
  | 'previously_unsubscribed'
  /** The list is off, or was never configured. Nothing to call. */
  | 'not_configured'
  /** The provider refused our credentials or the request itself. */
  | 'provider_rejected'
  /** The provider was unreachable or timed out. The one retryable failure. */
  | 'provider_unavailable'

/** What every adapter is handed. */
export interface SubscribeArgs {
  config: MailingListConfig
  /** The address to subscribe. Already normalized by the caller. */
  email: string
  /** The person's name, when the submission carried one. */
  name?: string
  /** A locale code, passed to the provider's own language attribute. */
  locale?: string
  /** A short provenance tag — `event-registration`, a form's slug. */
  source?: string
  /** Bounds every provider call. A hung third party must not hold a job open. */
  signal: AbortSignal
}

/** How long a provider has to answer before the attempt is abandoned. */
export const PROVIDER_TIMEOUT_MS = 8000

/**
 * Narrow an unknown fetch rejection onto the failure union.
 *
 * Every adapter needs this and none of them should decide it differently: an
 * abort, a DNS failure and a socket reset are all "the provider was not there",
 * which is the one failure worth retrying.
 */
export function transportFailure(error: unknown): MailingListResult {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, code: 'provider_unavailable', message, retryable: true }
}
