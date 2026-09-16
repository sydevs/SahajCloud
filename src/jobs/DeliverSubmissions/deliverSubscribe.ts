import type { DeliveryContext, DeliveryOutcome } from './types'

import { readSubmissionValue } from '@/collections/UserSubmissions/submissionData'
import { subscribeToMailingList } from '@/lib/mailingList/subscribe'
import type { MailingListConfig } from '@/lib/mailingList/types'
import { relationId } from '@/lib/utilities/relationId'


/**
 * Deliver a subscribe submission: push the address to the target client's
 * mailing-list provider.
 *
 * **The target list is resolved here, at delivery time, not stored on the row.**
 * Two reasons, and both bite: an operator moving a client between providers must
 * not have to rewrite every pending row, and a registration-spawned subscribe
 * row has no form of its own to name a list — it inherits the provenance
 * client's. A stored target column would have to be kept in step with the
 * client record by something, and nothing would.
 *
 * ⚠ **This only ever runs on a row that passed screening**, which is the whole
 * point of splitting screening from delivery: a list's quota and a sender's
 * reputation are spent on every address pushed to it, so a throwaway address
 * must never reach the provider.
 */
export async function deliverSubscribe({
  req,
  submission,
}: DeliveryContext): Promise<DeliveryOutcome> {
  const email = submission.senderEmail?.trim()
  if (!email) {
    // A subscription with no address is not a transport problem, and no number
    // of retries will find one.
    return { ok: false, detail: 'The submission carries no email address.', retryable: false }
  }

  const config = await resolveMailingList(req, submission)
  if (!config) {
    return {
      ok: false,
      detail: 'No service with a mailing list could be resolved for this submission.',
      retryable: false,
    }
  }

  const result = await subscribeToMailingList({
    config,
    email,
    name: readSubmissionValue(submission.submissionData, 'name'),
    locale: readSubmissionValue(submission.submissionData, 'locale'),
    source: submission.event != null ? 'event-registration' : 'subscribe-form',
  })

  if (result.ok) {
    return {
      ok: true,
      sentTo: `${config.provider} list ${config.listId}`,
      // The provider's own word for what it did — `pending` and `accepted` both
      // mean "not confirmed", and an admin reading the log needs to see which.
      detail: result.status,
    }
  }

  return { ok: false, detail: `${result.code}: ${result.message}`, retryable: result.retryable }
}

/**
 * Which client's list this address belongs on.
 *
 * The form's `client` when the row came from an authored subscribe form; the
 * provenance client otherwise, which is what a registration-spawned row has.
 *
 * ⚠ **Read from the `clients` document, never from `req.user`.** The API-key
 * strategy loads the whole client record onto the request — but
 * `managersOnlyFieldAccess` strips `mailingList` from it, so a self-targeting
 * row would silently see an unconfigured list and be refused as
 * `not_configured`. `overrideAccess: true` is what gets the group back.
 */
async function resolveMailingList(
  req: DeliveryContext['req'],
  submission: DeliveryContext['submission'],
): Promise<MailingListConfig | null> {
  const clientId = (await clientIdFromForm(req, submission.form)) ?? relationId(submission.client)
  if (clientId == null) return null

  const client = await req.payload.findByID({
    collection: 'clients',
    id: clientId,
    depth: 0,
    select: { mailingList: true },
    overrideAccess: true,
    disableErrors: true,
  })

  return (client?.mailingList as MailingListConfig | undefined) ?? null
}

/** The `client` a subscribe form names, or `null` when there is no form. */
async function clientIdFromForm(
  req: DeliveryContext['req'],
  form: unknown,
): Promise<number | null> {
  const formId = relationId(form)
  if (formId == null) return null

  const doc = await req.payload.findByID({
    collection: 'forms',
    id: formId,
    depth: 0,
    select: { client: true },
    overrideAccess: true,
    disableErrors: true,
  })

  return relationId((doc as { client?: unknown } | null)?.client)
}
