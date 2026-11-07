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

  const response = await postJson('https://api.brevo.com/v3/contacts', {
    headers: { 'api-key': config.apiKey ?? '' },
    body: {
      email,
      listIds: [listId],
      updateEnabled: true,
      attributes: {
        ...(name ? { FIRSTNAME: name } : {}),
        ...(locale ? { LANGUAGE: locale } : {}),
        ...(source ? { SOURCE: source } : {}),
      },
    },
    signal,
  })
  if ('code' in response) return response

  if (response.ok) return { ok: true, status: 'subscribed' }

  const detail = await readError(response)

  // Brevo reports a blocklisted contact rather than silently re-adding it. It
  // is the same promise Mailchimp's compliance state carries, under its own
  // name, and it is terminal for the same reason.
  if (/blocklist|blacklist|unsubscrib/i.test(detail)) {
    return { ok: false, code: 'previously_unsubscribed', message: detail, retryable: false }
  }

  return statusFailure(response.status, detail)
}

/**
 * Brevo's error body, as one sentence. A `code` with no `message` beside it is
 * dropped for the status line: an opaque `invalid_parameter` names nothing an
 * operator can act on.
 */
function readError(response: Response): Promise<string> {
  return providerError<{ code?: unknown; message?: unknown }>(response, 'Brevo', (body) =>
    typeof body.message === 'string' ? [body.code, body.message] : [],
  )
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
