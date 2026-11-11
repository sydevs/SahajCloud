import type { Client } from '@/payload-types'

/** The `mailingList` group as it sits on a Clients document. */
export type MailingListConfig = NonNullable<Client['mailingList']>

/**
 * The providers this repo speaks, derived from the generated `Client` rather
 * than restated here — `Clients.mailingList.provider` is the one declaration.
 */
export type MailingListProvider = NonNullable<MailingListConfig['provider']>

/**
 * The same list at runtime, which is what the select renders its options from.
 * It cannot drift from the union above: `MAILING_LIST_ADAPTERS` is keyed on the
 * union, so a provider offered here with no adapter — or an adapter for one no
 * longer offered — fails to compile.
 */
export const MAILING_LIST_PROVIDERS = ['mailchimp', 'brevo', 'klaviyo', 'cleverreach'] as const

/**
 * Every field a provider has an opinion about, and so the whole credential
 * vocabulary: what `validateMailingList` spends a round trip on, what
 * `POST /api/clients/:id/mailing-list-key` accepts, and what its drawer sends.
 *
 * It lives here rather than beside any one of those, because a fifth provider
 * field spelled in only two of the three is a key proven against a value the
 * operator is not looking at.
 *
 * `doubleOptIn` is one of them because it changes **what** is checked, not only
 * what is sent: with it on, CleverReach's `verifyCredentials` also reads the
 * confirmation flow, so turning it back on makes a stored `doiFlowId`
 * load-bearing again and worth proving.
 */
export const CREDENTIAL_KEYS = [
  'provider',
  'listId',
  'apiKey',
  'clientId',
  'doiFlowId',
  'doubleOptIn',
] as const satisfies readonly (keyof MailingListConfig)[]

/** What each provider is called, in the select and on the Install tab. */
export const MAILING_LIST_PROVIDER_LABELS: Record<MailingListProvider, string> = {
  mailchimp: 'Mailchimp',
  brevo: 'Brevo',
  klaviyo: 'Klaviyo',
  cleverreach: 'CleverReach',
}

/**
 * What one subscribe attempt produced.
 *
 * The success arm carries the status the provider can actually **justify**,
 * which is why there are three of them rather than a boolean:
 *
 * - `subscribed` — the address is on the list now (Mailchimp and CleverReach
 *   with double opt-in off, Brevo always, and any of the three for an address
 *   already there — idempotent, and it does not leak list membership).
 * - `pending` — accepted, and the provider is waiting on the person to confirm
 *   (Mailchimp and CleverReach with double opt-in on).
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

/** The failure arm alone, for a helper or a caller that can only refuse. */
export type MailingListFailure = Extract<MailingListResult, { ok: false }>

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
  /**
   * The provider was unreachable, timed out, or had a bad moment.
   *
   * The only code a retry can help, and even then not always: a call whose
   * side effect may already have landed is refused terminally under this same
   * code, because what happened to the provider is not what a retry would
   * cost. CleverReach's confirmation send is that case.
   */
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
  /**
   * Client-reported request context off the submission row
   * (`CLIENT_CONTEXT_KEYS`), for a provider that keeps a record of the opt-in.
   * Passed whenever the row carries them, like `locale` above. Nothing starts
   * storing a visitor's IP for this: an incomplete record is worth more than a
   * new column of personal data (#1086).
   */
  userAgent?: string
  hostUrl?: string
  /** Bounds every provider call. A hung third party must not hold a job open. */
  signal: AbortSignal
}

/**
 * One provider, as everything outside `providers/` sees it.
 *
 * Adding a provider is one object implementing this plus one entry in
 * `MAILING_LIST_ADAPTERS`. Nothing else branches on `config.provider`: the
 * opt-in model, the error vocabulary and the shape of a credential check are
 * all differences the adapter owns, and `MailingListResult` is what they agree
 * on.
 */
export interface MailingListAdapter {
  /** Push one address to the configured list. Never throws. */
  subscribe(args: SubscribeArgs): Promise<MailingListResult>
  /**
   * Prove a saved credential resolves: the provider's own refusal message, or
   * `null` when it is satisfied. Always a **read** of the named list — never a
   * write, and never a subscribe. It may throw on a transport failure, because
   * what an unreachable provider means is the caller's decision, not this one's.
   */
  verifyCredentials(config: MailingListConfig, signal: AbortSignal): Promise<string | null>
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
export function transportFailure(error: unknown): MailingListFailure {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, code: 'provider_unavailable', message, retryable: true }
}

/**
 * Narrow a refusal status onto the failure union.
 *
 * `transportFailure`'s twin, shared for the same reason: 5xx and 429 are the
 * provider having a bad moment, and any other status is us being wrong, which
 * will be wrong identically next time. A provider's own compliance answer — the
 * words it reports an opt-out in — is read before this, by the adapter that
 * knows them.
 */
export function statusFailure(status: number, message: string): MailingListFailure {
  const retryable = status >= 500 || status === 429
  return {
    ok: false,
    code: retryable ? 'provider_unavailable' : 'provider_rejected',
    message,
    retryable,
  }
}
