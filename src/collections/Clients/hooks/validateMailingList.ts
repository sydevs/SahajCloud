import type { CollectionBeforeChangeHook } from 'payload'

import { APIError } from 'payload'

import { datacenterOf } from '@/lib/mailingList/providers/mailchimp'
import type { MailingListConfig } from '@/lib/mailingList/types'
import { PROVIDER_TIMEOUT_MS } from '@/lib/mailingList/types'

/** The three fields whose change makes a save worth a provider round trip. */
const CREDENTIAL_KEYS = ['provider', 'listId', 'apiKey'] as const

/**
 * beforeChange: prove a newly-entered mailing-list credential actually works,
 * and refuse the save when it does not.
 *
 * The alternative is discovering it at delivery time, in a job, against a real
 * subscriber — where the only record is a failed `activityLog` entry nobody is
 * watching. A typo in an API key is an operator's mistake to see while they are
 * still looking at the form.
 *
 * ⚠ **The change gate is load-bearing, not an optimisation.** `clients` runs
 * `versions: { drafts: true, maxPerDoc: 1 }`, so this hook fires on every draft
 * and autosave. Without the gate, editing a client's colours would make the
 * save depend on a third party being reachable — an outage at Mailchimp would
 * lock every client document in the CMS.
 */
export const validateMailingList: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const config = data?.mailingList as MailingListConfig | undefined
  if (!config?.enabled) return data

  const previous = (originalDoc?.mailingList ?? null) as MailingListConfig | null
  const changed = CREDENTIAL_KEYS.some((key) => config[key] !== previous?.[key])
  // Nothing a provider could have an opinion about has changed. It said yes to
  // these exact three values when they were entered.
  if (!changed) return data

  const failure = await checkCredentials(config)
  if (failure) {
    // `APIError`, not a field `validate`: the message is the provider's own
    // words, and a validator returning a foreign error string against one field
    // reads as though that field's format were wrong. This is the save being
    // refused, and it says who refused it.
    throw new APIError(`Mailing list: ${failure}`, 400, { code: 'mailing_list_invalid' }, true)
  }

  req.payload.logger.info({
    msg: 'validateMailingList: credentials confirmed',
    provider: config.provider,
  })

  return data
}

/**
 * Ask the provider whether this key and list resolve. Returns the provider's
 * own message on refusal, or `null` when it is satisfied.
 *
 * Every probe is a **read** of the named list — never a write, and never a
 * subscribe. Validating by adding an address would put a real contact on a real
 * list every time somebody edited a key.
 */
async function checkCredentials(config: MailingListConfig): Promise<string | null> {
  const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
  const apiKey = config.apiKey ?? ''
  const listId = config.listId ?? ''

  try {
    switch (config.provider) {
      case 'mailchimp': {
        const dc = datacenterOf(apiKey)
        if (!dc) return 'the API key carries no datacenter suffix (expected `…-us14`).'
        return await probe(
          `https://${dc}.api.mailchimp.com/3.0/lists/${encodeURIComponent(listId)}`,
          { Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString('base64')}` },
          signal,
        )
      }
      case 'brevo': {
        if (!Number.isInteger(Number(listId))) return 'the Brevo list id must be a number.'
        return await probe(
          `https://api.brevo.com/v3/contacts/lists/${encodeURIComponent(listId)}`,
          { 'api-key': apiKey },
          signal,
        )
      }
      case 'klaviyo':
        return await probe(
          `https://a.klaviyo.com/api/lists/${encodeURIComponent(listId)}/`,
          {
            Authorization: `Klaviyo-API-Key ${apiKey}`,
            revision: '2024-10-15',
            accept: 'application/vnd.api+json',
          },
          signal,
        )
      default:
        return `\`${String(config.provider)}\` is not a provider this build speaks.`
    }
  } catch {
    // The provider being unreachable is **not** a reason to refuse the save.
    // An operator cannot fix a Mailchimp outage, and blocking their edit until
    // it clears would be this hook doing more harm than the typo it exists to
    // catch. The credential goes in unproven, and delivery is what finds out.
    return null
  }
}

/** One authenticated GET. Returns the provider's message, or `null` on 2xx. */
async function probe(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<string | null> {
  const response = await fetch(url, { headers, signal })
  if (response.ok) return null

  if (response.status === 401 || response.status === 403) {
    return 'that API key was refused.'
  }
  if (response.status === 404) {
    return 'that list id does not exist on this account.'
  }
  // A 5xx reaches here rather than the catch above, so it is turned back into
  // the same "cannot prove it, do not block" answer the catch gives.
  if (response.status >= 500) return null

  return `the provider answered ${response.status}.`
}
