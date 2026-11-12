import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'

import { APIError } from 'payload'

import type { SecretVerifyArgs } from '@/fields'
import { adapterFor, unknownProviderMessage } from '@/lib/mailingList/providers'
import { isMailingListConfigured } from '@/lib/mailingList/subscribe'
import type { MailingListConfig } from '@/lib/mailingList/types'
import { PROVIDER_TIMEOUT_MS } from '@/lib/mailingList/types'

/**
 * The fields whose change makes a save worth a provider round trip.
 *
 * `doubleOptIn` is one of them because it changes **what** is checked, not only
 * what is sent: with it on, CleverReach's `verifyCredentials` also reads the
 * confirmation flow, so turning it back on makes a stored `doiFlowId`
 * load-bearing again and worth proving.
 *
 * ⚠ `provider` is also the list's on switch: a list is switched off by clearing
 * it, edited while nothing proves it — this hook returns early without one —
 * and switched back on by choosing it again. That last save changes `provider`,
 * so it is proven, however little else changed.
 */
export const CREDENTIAL_KEYS = [
  'provider',
  'listId',
  'apiKey',
  'clientId',
  'doiFlowId',
  'doubleOptIn',
] as const

/**
 * beforeChange: prove a newly-entered mailing-list credential actually works,
 * and refuse the save when it does not.
 *
 * The alternative is discovering it at delivery time, in a job, against a real
 * subscriber — where the only record is a failed `activityLog` entry nobody is
 * watching. A typo in an API key is an operator's mistake to see while they are
 * still looking at the form.
 *
 * ⚠ **The change gate is load-bearing, not an optimisation.** This hook fires on
 * every save of the row — the Install tab saves each choice as it is made.
 * Without the gate, editing a client's colours would make the
 * save depend on a third party being reachable — an outage at Mailchimp would
 * lock every client document in the CMS.
 */
export const validateMailingList: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const incoming = data?.mailingList as MailingListConfig | undefined
  if (!incoming?.provider) return data

  const previous = (originalDoc?.mailingList ?? null) as MailingListConfig | null

  // ⚠ **A form save carries no key, and one still arrives here.** `secretField`
  // keeps it out of form state. Its own `beforeValidate` hook resolves a staged
  // key (or a removal) to plaintext, and otherwise Payload back-fills the
  // omitted field from the stored document, decrypted — so `incoming.apiKey` is
  // the plaintext the provider must be asked about, new or stored.

  // Incomplete credentials are Payload's `required` to refuse, not ours.
  // Pinging with a blank key would answer "that API key was refused", blaming
  // the operator for a field they have not filled in yet.
  if (!isMailingListConfigured(incoming)) return data
  const changed = CREDENTIAL_KEYS.some((key) => incoming[key] !== previous?.[key])
  // Nothing a provider could have an opinion about has changed. It said yes to
  // these exact values when they were entered.
  if (!changed) return data

  const failure = await checkCredentials(incoming, req)
  if (failure) {
    // `APIError`, not a field `validate`: the message is the provider's own
    // words, and a validator returning a foreign error string against one field
    // reads as though that field's format were wrong. This is the save being
    // refused, and it says who refused it.
    throw new APIError(`Mailing list: ${failure}`, 400, { code: 'mailing_list_invalid' }, true)
  }

  return data
}

/**
 * The set modal's check of a key before it is staged, against the form's
 * unsaved provider and list. Save proves it again through the hook above,
 * against what is actually saved.
 */
export async function verifyMailingListKey({
  req,
  siblingData,
  value,
}: SecretVerifyArgs): Promise<string | null> {
  const config = { ...siblingData, apiKey: value } as MailingListConfig
  if (!config.provider || !config.listId) {
    return 'Choose a mailing list provider and enter the List ID first.'
  }
  const failure = await checkCredentials(config, req)
  // Adapters word a refusal to follow "Mailing list: "; standing alone it needs a capital.
  return failure && failure.charAt(0).toUpperCase() + failure.slice(1)
}

/**
 * Ask the provider whether this key and list resolve. Returns the provider's
 * own message on refusal, or `null` when it is satisfied.
 *
 * What to ask, and how, belongs to the adapter — every one of them asks it as a
 * **read** of the named list, never a write and never a subscribe, since
 * validating by adding an address would put a real contact on a real list every
 * time somebody edited a key. This function owns only what a *save* should do
 * with the answer.
 */
async function checkCredentials(
  config: MailingListConfig,
  req: PayloadRequest,
): Promise<string | null> {
  const adapter = adapterFor(config.provider)
  if (!adapter) return unknownProviderMessage(config.provider)

  try {
    const failure = await adapter.verifyCredentials(
      config,
      AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    )
    if (!failure) {
      req.payload.logger.info({
        msg: 'validateMailingList: credentials confirmed',
        provider: config.provider,
      })
    }
    return failure
  } catch {
    // The provider being unreachable is **not** a reason to refuse the save.
    // An operator cannot fix a Mailchimp outage, and blocking their edit until
    // it clears would be this hook doing more harm than the typo it exists to
    // catch. The credential goes in unproven, and delivery is what finds out.
    //
    // ⚠ Its own log line, never the success one. A provider that timed out and
    // a provider that said yes must not read the same afterwards, and an
    // adapter spending its budget over several round trips reaches this on
    // ordinary latency.
    req.payload.logger.warn({
      msg: 'validateMailingList: provider unreachable, credentials unproven',
      provider: config.provider,
    })
    return null
  }
}
