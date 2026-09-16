import type { CollectionAfterChangeHook } from 'payload'

import { relationId } from '@/lib/utilities/relationId'

import { parseOptIn, readSubmissionValue, SUBSCRIBE_OPT_IN } from '../submissionData'

/**
 * afterChange (create): a registration whose registrant ticked the mailing-list
 * box spawns a linked subscribe-type row, in the same request.
 *
 * **This replaces the `mailingListSubscribedAt` timestamp**, and the difference
 * is the whole point: a timestamp recorded that somebody had consented and
 * delivered nothing. The consent is now a real row with its own status, its own
 * screening, its own retries and its own activity log — so "did this person
 * actually reach the list" has an answer, and a provider outage is a `failed`
 * row somebody can see rather than a silence.
 *
 * ⚠ **The spawned row carries the registration's `event`, and that is its
 * link.** There is no separate parent column: `event` is what ties the consent
 * back to the registration that produced it, what exempts the row from needing
 * a form of its own (`perTypeForm` in `../fields.ts`), and what tells
 * `deliverSubscribe` to tag the subscription `event-registration`.
 *
 * ⚠ **The target list is resolved at delivery, not here.** The row names no
 * client of its own beyond the provenance one it inherits, so an operator
 * moving a client between providers does not have to rewrite pending rows.
 *
 * Failure is swallowed and logged. The registrant *is* registered by the time
 * this runs, and a subscription that could not be recorded must not undo that
 * — same stance as the confirmation email, for the same reason.
 */
export const spawnSubscribeFromRegistration: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create' || doc.type !== 'registration') return doc
  if (!parseOptIn(readSubmissionValue(doc.submissionData, SUBSCRIBE_OPT_IN))) return doc

  const senderEmail = typeof doc.senderEmail === 'string' ? doc.senderEmail.trim() : ''
  // Nothing to subscribe. A registration may be anonymous; an opt-in with no
  // address is a caller bug, and a row nobody could ever deliver is worse than
  // no row.
  if (!senderEmail) return doc

  try {
    await req.payload.create({
      collection: 'user-submissions',
      data: {
        type: 'subscribe',
        senderEmail,
        event: relationId(doc.event),
        user: relationId(doc.user),
        client: relationId(doc.client),
        status: 'pending',
        // Carried over rather than re-derived: the provider wants a name and a
        // language, and these are the registrant's own answers to both.
        submissionData: [
          { field: 'name', value: readSubmissionValue(doc.submissionData, 'name') ?? '' },
          { field: 'locale', value: readSubmissionValue(doc.submissionData, 'locale') ?? '' },
        ].filter((pair) => pair.value !== ''),
      },
      // The row is system-composed from an already-screened registration, so it
      // must not be re-judged as a fresh public write: the write guard would
      // demand a Turnstile token this request has already spent, and the
      // system-field access would refuse `client`, `user` and `status`.
      overrideAccess: true,
      context: { skipWriteGuard: true },
      req,
    })
  } catch (error) {
    req.payload.logger.error({
      msg: 'spawnSubscribeFromRegistration: the opt-in row could not be created; the registration stands',
      submissionId: doc.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return doc
}
