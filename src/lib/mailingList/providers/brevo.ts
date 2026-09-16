import type {
  MailingListAdapter,
  MailingListConfig,
  MailingListResult,
  SubscribeArgs,
} from '../types'

import { probeCredentials } from '../probe'
import { transportFailure } from '../types'

/**
 * Subscribe one address to a Brevo list.
 *
 * **Always single opt-in**, and the admin UI says so rather than pretending
 * otherwise: `POST /v3/contacts` adds the contact immediately, and Brevo's own
 * double opt-in is a different call needing a template id and a redirect URL —
 * fields the generic provider trio does not carry. So this adapter never
 * returns `pending`, and `doubleOptIn` is not rendered for it.
 *
 * `updateEnabled` makes a repeat address a no-op update rather than a 400, so
 * there is no already-a-member branch to write.
 */
async function subscribeBrevo(args: SubscribeArgs): Promise<MailingListResult> {
  const { config, email, name, locale, source, signal } = args

  const listId = Number(config.listId)
  if (!Number.isInteger(listId)) {
    return {
      ok: false,
      code: 'provider_rejected',
      message: 'The Brevo list id must be a number.',
      retryable: false,
    }
  }

  let response: Response
  try {
    response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'api-key': config.apiKey ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        listIds: [listId],
        updateEnabled: true,
        attributes: {
          ...(name ? { FIRSTNAME: name } : {}),
          ...(locale ? { LANGUAGE: locale } : {}),
          ...(source ? { SOURCE: source } : {}),
        },
      }),
      signal,
    })
  } catch (error) {
    return transportFailure(error)
  }

  if (response.ok) return { ok: true, status: 'subscribed' }

  const detail = await readError(response)

  // Brevo reports a blocklisted contact rather than silently re-adding it. It
  // is the same promise Mailchimp's compliance state carries, under its own
  // name, and it is terminal for the same reason.
  if (/blocklist|blacklist|unsubscrib/i.test(detail)) {
    return { ok: false, code: 'previously_unsubscribed', message: detail, retryable: false }
  }

  const retryable = response.status >= 500 || response.status === 429
  return {
    ok: false,
    code: retryable ? 'provider_unavailable' : 'provider_rejected',
    message: detail,
    retryable,
  }
}

/** Brevo's error body, as one sentence. Never throws — see the Mailchimp twin. */
async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { code?: unknown; message?: unknown }
    if (typeof body.message === 'string' && body.message.trim() !== '') {
      return typeof body.code === 'string' ? `${body.code}: ${body.message}` : body.message
    }
  } catch {
    // Fall through to the status line.
  }
  return `Brevo answered ${response.status}.`
}

/** Read the named list back. Brevo's list id is numeric, so that is checked first. */
async function verifyBrevo(config: MailingListConfig, signal: AbortSignal): Promise<string | null> {
  const listId = config.listId ?? ''
  if (!Number.isInteger(Number(listId))) return 'the Brevo list id must be a number.'

  return probeCredentials(
    `https://api.brevo.com/v3/contacts/lists/${encodeURIComponent(listId)}`,
    { 'api-key': config.apiKey ?? '' },
    signal,
  )
}

export const brevoAdapter: MailingListAdapter = {
  subscribe: subscribeBrevo,
  verifyCredentials: verifyBrevo,
}
