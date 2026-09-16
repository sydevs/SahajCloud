import type {
  MailingListAdapter,
  MailingListConfig,
  MailingListResult,
  SubscribeArgs,
} from '../types'

import { probeCredentials } from '../probe'
import { transportFailure } from '../types'

/**
 * Mailchimp's datacenter is carried in the key's own suffix (`…-us14`), so the
 * host is derivable and no second field is needed. A key without one is a
 * configuration error, and `validateMailingList` is what catches it at save
 * time rather than here at delivery time.
 */
export function datacenterOf(apiKey: string): string | null {
  const suffix = apiKey.split('-')[1]?.trim()
  return suffix && /^[a-z]{2}\d+$/i.test(suffix) ? suffix.toLowerCase() : null
}

/**
 * Subscribe one address to a Mailchimp audience.
 *
 * The only adapter with a per-call opt-in lever (`status`), and the only one
 * that can report `previously_unsubscribed`: Mailchimp answers 400 with
 * `title: 'Member In Compliance State'` (or "Forgotten Email Not Subscribed")
 * for an address that opted out, and re-adding it is exactly what gets a sender
 * blocklisted. That case is mapped terminal, never retried.
 */
async function subscribeMailchimp(args: SubscribeArgs): Promise<MailingListResult> {
  const { config, email, name, locale, source, signal } = args
  const apiKey = config.apiKey ?? ''
  const dc = datacenterOf(apiKey)

  if (!dc) {
    return {
      ok: false,
      code: 'provider_rejected',
      message: 'The Mailchimp API key carries no datacenter suffix (expected `…-us14`).',
      retryable: false,
    }
  }

  let response: Response
  try {
    response = await fetch(
      `https://${dc}.api.mailchimp.com/3.0/lists/${encodeURIComponent(config.listId ?? '')}/members`,
      {
        method: 'POST',
        headers: {
          Authorization: authHeader(apiKey),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email_address: email,
          status: config.doubleOptIn === false ? 'subscribed' : 'pending',
          ...(name ? { merge_fields: { FNAME: name } } : {}),
          ...(locale ? { language: locale } : {}),
          ...(source ? { tags: [source] } : {}),
        }),
        signal,
      },
    )
  } catch (error) {
    return transportFailure(error)
  }

  if (response.ok) {
    return { ok: true, status: config.doubleOptIn === false ? 'subscribed' : 'pending' }
  }

  const detail = await readError(response)

  // Already a member is a success, on purpose. It is idempotent for the caller,
  // and answering anything else would report list membership back to a public
  // surface — which is a disclosure, not a courtesy.
  if (response.status === 400 && /already a list member/i.test(detail)) {
    return { ok: true, status: 'subscribed' }
  }

  if (response.status === 400 && /compliance state|forgotten email/i.test(detail)) {
    return {
      ok: false,
      code: 'previously_unsubscribed',
      message: detail,
      retryable: false,
    }
  }

  // 5xx and 429 are the provider having a bad moment; a 4xx is us being wrong,
  // and will be wrong identically next time.
  const retryable = response.status >= 500 || response.status === 429
  return {
    ok: false,
    code: retryable ? 'provider_unavailable' : 'provider_rejected',
    message: detail,
    retryable,
  }
}

/**
 * Mailchimp's error body, as one sentence.
 *
 * Never throws: this runs on the failure path, and a provider answering
 * something unparseable must not turn a clean 400 into an exception the caller
 * reads as a transport failure.
 */
export async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { title?: unknown; detail?: unknown }
    const parts = [body.title, body.detail].filter(
      (part): part is string => typeof part === 'string' && part.trim() !== '',
    )
    if (parts.length > 0) return parts.join(': ')
  } catch {
    // Fall through to the status line.
  }
  return `Mailchimp answered ${response.status}.`
}

/** Mailchimp's documented Basic form: any username, the key as password. */
function authHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`anystring:${apiKey}`).toString('base64')}`
}

/** Read the named audience back — the cheapest proof the key and list resolve. */
async function verifyMailchimp(
  config: MailingListConfig,
  signal: AbortSignal,
): Promise<string | null> {
  const apiKey = config.apiKey ?? ''
  const dc = datacenterOf(apiKey)
  if (!dc) return 'the API key carries no datacenter suffix (expected `…-us14`).'

  return probeCredentials(
    `https://${dc}.api.mailchimp.com/3.0/lists/${encodeURIComponent(config.listId ?? '')}`,
    { Authorization: authHeader(apiKey) },
    signal,
  )
}

export const mailchimpAdapter: MailingListAdapter = {
  subscribe: subscribeMailchimp,
  verifyCredentials: verifyMailchimp,
}
