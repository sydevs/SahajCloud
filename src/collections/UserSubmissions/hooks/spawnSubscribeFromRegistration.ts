import type { CollectionAfterChangeHook } from 'payload'

import { relationId } from '@/lib/utilities/relationId'
import { asTrustedReq } from '@/plugins/usage/hooks'

import { parseOptIn, readSubmissionValue, SUBSCRIBE_OPT_IN } from '../submissionData'

/**
 * afterChange (create): a registration whose registrant ticked the mailing-list
 * box spawns a linked subscribe-type row, in the same request — one per
 * `(user, event)`, however many times that registrant signs up.
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
 * ⚠ **The target list is resolved at delivery, not here**, from the event's
 * region (`mailingListClientFor`), so an operator moving a client between
 * providers does not have to rewrite pending rows. The provenance `client` it
 * inherits records who relayed the opt-in, not whose list it joins.
 *
 * Failure is swallowed and logged. The registrant *is* registered by the time
 * this runs, and a subscription that could not be recorded must not undo that
 * — same stance as the confirmation email, for the same reason.
 */
export const spawnSubscribeFromRegistration: CollectionAfterChangeHook = async ({
  data,
  doc,
  operation,
  req,
}) => {
  // ⚠ **Every input here comes from `data`, never from `doc`** (#1093). `doc`
  // is the `afterRead` projection, and a create's `select` is a caller-set query
  // parameter no gate polices — so `POST …?select[id]=true` emptied `doc` of
  // `type` and `submissionData`, and the registrant's ticked box recorded
  // nothing at all. That silence is what this row exists to stop. `doc.id` is
  // the exception, and is safe: payload returns the new row's id whatever the
  // projection asks for.
  if (operation !== 'create' || data.type !== 'registration') return doc
  if (!parseOptIn(readSubmissionValue(data.submissionData, SUBSCRIBE_OPT_IN))) return doc

  // Nothing to subscribe. A registration may be anonymous; an opt-in with no
  // address is a caller bug, and a row nobody could ever deliver is worse than
  // no row.
  const userId = relationId(data.user)
  if (userId == null) return doc

  const eventId = relationId(data.event)

  // ⚠ **Every read below is inside the `try`, not just the create.** This hook
  // runs in the registration's own transaction, so anything thrown here rolls
  // that registration back — and the docblock's promise is the opposite: the
  // registrant is registered by now, and a consent row that could not be
  // recorded must not undo that. A statement timeout on the existence check is
  // as capable of throwing as the create is.
  try {
    // ⚠ **One consent row per `(user, event)`.** A repeat signup is a create —
    // `mergeRepeatRegistration` folds it in and then deletes the new row — so
    // this hook fires again on every signup, and without the check the
    // provider is asked to subscribe the same address once per attempt.
    //
    // Any status counts, `failed`, `rejected` and `spam` included: each is an
    // answer about this person's consent, and a second row would neither
    // deliver what the first could not nor overturn a refusal.
    //
    // Above the `users` read, which a repeat signup then never pays for. Both
    // inputs come from `data`, so nothing sequences it after that read.
    const { docs: held } = await req.payload.find({
      collection: 'user-submissions',
      where: {
        and: [
          { type: { equals: 'subscribe' } },
          { user: { equals: userId } },
          { event: { equals: eventId } },
        ],
      },
      limit: 1,
      // `pagination: false` so drizzle skips the `COUNT(DISTINCT …)` it
      // otherwise runs beside every `find` — a second statement, inside the
      // create's own open transaction, for a total this discards.
      pagination: false,
      depth: 0,
      overrideAccess: true,
      // Ours, not the caller's: `validateClientQueryParamsHook` is a
      // `beforeOperation` hook, so `overrideAccess` does not reach it and a
      // client read naming no `select` answers 400.
      req: asTrustedReq(req),
    })
    if (held.length > 0) return doc

    // ⚠ Read here, not off `doc.senderEmail`: that virtual resolves under the
    // caller's access, and a client cannot read `users`, so on every real
    // create it is absent. `req` because the user row was upserted in this
    // transaction.
    const sender = await req.payload.findByID({
      collection: 'users',
      id: userId,
      select: { email: true },
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
      req,
    })
    const senderEmail = sender?.email?.trim() ?? ''
    if (!senderEmail) return doc

    await req.payload.create({
      collection: 'user-submissions',
      data: {
        type: 'subscribe',
        senderEmail,
        event: eventId,
        user: userId,
        client: relationId(data.client),
        status: 'pending',
        // Carried over rather than re-derived: the provider wants a name and a
        // language, and these are the registrant's own answers to both.
        submissionData: [
          { field: 'name', value: readSubmissionValue(data.submissionData, 'name') ?? '' },
          { field: 'locale', value: readSubmissionValue(data.submissionData, 'locale') ?? '' },
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
