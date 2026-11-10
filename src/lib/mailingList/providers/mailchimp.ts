import type {
  MailingListAdapter,
  MailingListConfig,
  MailingListResult,
  SubscribeArgs,
} from '../types'

import { postJson, providerError } from '../http'
import { probeCredentials } from '../probe'
import { statusFailure } from '../types'

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

  const response = await postJson(
    `https://${dc}.api.mailchimp.com/3.0/lists/${encodeURIComponent(config.listId ?? '')}/members`,
    {
      headers: { Authorization: authHeader(apiKey) },
      body: {
        email_address: email,
        status: config.doubleOptIn === false ? 'subscribed' : 'pending',
        ...(name ? { merge_fields: { FNAME: name } } : {}),
        ...(locale ? { language: locale } : {}),
        ...(source ? { tags: [source] } : {}),
      },
      signal,
    },
  )
  if ('code' in response) return response

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

  return statusFailure(response.status, detail)
}

/** Mailchimp's error body, as one sentence. */
export function readError(response: Response): Promise<string> {
  return providerError<{ title?: unknown; detail?: unknown }>(response, 'Mailchimp', (body) => [
    body.title,
    body.detail,
  ])
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
