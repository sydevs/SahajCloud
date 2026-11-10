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
 * Klaviyo's API is versioned by a date header rather than a path segment, so
 * this constant *is* the contract version. Bumping it changes every request
 * shape below, which is why it is named here and not inlined.
 */
const KLAVIYO_REVISION = '2024-10-15'

/**
 * Subscribe one address to a Klaviyo list.
 *
 * **Asynchronous, and the result type says so.** The subscribe-job endpoint
 * answers 202 with no per-profile result, so this adapter cannot tell "newly
 * subscribed" from "already on the list" from "previously unsubscribed"
 * inline. It therefore always returns `accepted`, and
 * `previously_unsubscribed` can never arise for it.
 *
 * ⚠ **Nothing here bypasses suppression.** This is the plain subscribe job,
 * with no `historical_import`-style flag: an address Klaviyo has suppressed
 * stays suppressed, even though we cannot see that it was. The opt-in model is
 * governed by the list's own setting in Klaviyo, which is why `doubleOptIn` is
 * not rendered for this provider either.
 */
async function subscribeKlaviyo(args: SubscribeArgs): Promise<MailingListResult> {
  const { config, email, name, locale, signal } = args

  const response = await postJson(
    'https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/',
    {
      headers: {
        Authorization: `Klaviyo-API-Key ${config.apiKey ?? ''}`,
        revision: KLAVIYO_REVISION,
        accept: 'application/vnd.api+json',
      },
      body: {
        data: {
          type: 'profile-subscription-bulk-create-job',
          attributes: {
            profiles: {
              data: [
                {
                  type: 'profile',
                  attributes: {
                    email,
                    ...(name ? { first_name: name } : {}),
                    ...(locale ? { locale } : {}),
                    subscriptions: { email: { marketing: { consent: 'SUBSCRIBED' } } },
                  },
                },
              ],
            },
          },
          relationships: {
            list: { data: { type: 'list', id: config.listId ?? '' } },
          },
        },
      },
      signal,
    },
  )
  if ('code' in response) return response

  if (response.ok) return { ok: true, status: 'accepted' }

  return statusFailure(response.status, await readError(response))
}

/** Klaviyo's JSON:API error body, as one sentence. */
function readError(response: Response): Promise<string> {
  return providerError<{ errors?: { title?: unknown; detail?: unknown }[] }>(
    response,
    'Klaviyo',
    (body) => [body.errors?.[0]?.title, body.errors?.[0]?.detail],
  )
}

/** Read the named list back, at the same revision every other request uses. */
async function verifyKlaviyo(
  config: MailingListConfig,
  signal: AbortSignal,
): Promise<string | null> {
  return probeCredentials(
    `https://a.klaviyo.com/api/lists/${encodeURIComponent(config.listId ?? '')}/`,
    {
      Authorization: `Klaviyo-API-Key ${config.apiKey ?? ''}`,
      revision: KLAVIYO_REVISION,
      accept: 'application/vnd.api+json',
    },
    signal,
  )
}

export const klaviyoAdapter: MailingListAdapter = {
  subscribe: subscribeKlaviyo,
  verifyCredentials: verifyKlaviyo,
}
