import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  RequestContext,
} from 'payload'

import { APIError } from 'payload'

import type { EventBookkeeping } from '@/lib/events/updateEventWithoutValidation'
import { updateEventBookkeeping } from '@/lib/events/updateEventWithoutValidation'
import { computeCommunityVerdict } from '@/lib/eventVerification/communityFeedback'
import { EVENT_MACHINE } from '@/lib/eventVerification/machine'
import { activeRegistrationWhere } from '@/lib/registrations/active'
import { transition } from '@/lib/stateMachine/transition'
import { isRecord } from '@/lib/utilities/isRecord'
import { relationId } from '@/lib/utilities/relationId'
import { asSystemReq, asTrustedReq } from '@/plugins/usage/hooks'

/**
 * Registrant confirm/deny voting on unverified events, carried on the
 * registration row itself.
 *
 * ⚠ Both hooks run on every `user-submissions` write, for all four intakes, so
 * both open with a `type === 'registration'` guard. The vote check below it is
 * not a substitute: on a create `previousDoc` is undefined, and
 * `null === undefined` is false.
 *
 * The vote's only writer is the CMS-hosted `/registrations/feedback` page,
 * which records it with `overrideAccess` behind a signed token and an explicit
 * button press. No API client writes here: the `registrations: ['update']`
 * grant, its uuid-scoped access branch, and the field-whitelist hook that used
 * to guard them were removed with #723, having never been on the path a vote
 * actually takes. These two hooks survive because the page's write goes
 * through them.
 */

/**
 * beforeChange: gate + stamp a vote. Votes are only open while the event is
 * published and `unverified` — a denied event stops collecting votes (the
 * verdict landed), an adopted one no longer needs them (409 `feedback_closed`).
 * Re-voting while open is allowed and simply overwrites (idempotent recount).
 */
export const gateEventFeedback: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  if ((data?.type ?? originalDoc?.type) !== 'registration') return data
  const incoming = data?.eventFeedback
  if (incoming === undefined || incoming === originalDoc?.eventFeedback) return data

  // One lookup, one condition. The previous shape nested the checks inside
  // `if (eventId != null)`, so an absent relationship skipped the gate and the
  // vote was accepted — unreachable in practice, since `event` is required, but
  // it made the gate read as though a missing event were a tolerated case.
  // A *failed lookup* was always refused; that part is unchanged.
  const eventId = relationId(data?.event ?? originalDoc?.event)
  const event =
    eventId == null
      ? null
      : await req.payload
          .findByID({
            collection: 'events',
            id: eventId,
            depth: 0,
            select: { verificationStage: true, _status: true },
            overrideAccess: true,
            req: asTrustedReq(req),
          })
          .catch(() => null)

  if (!event || event._status !== 'published' || event.verificationStage !== 'unverified') {
    throw new APIError('Feedback is closed for this event.', 409, { code: 'feedback_closed' }, true)
  }

  return data
}

/**
 * afterChange: recount the event's confirm/deny tallies and store the verdict.
 *
 * Recount, never increment: concurrent votes converge on the true tally
 * instead of compounding a race. Each registrant (`user`) counts once, so
 * registering twice does not buy a second vote. Writes the Wilson lower bound
 * to the indexed `confidenceScore` and the tallies into
 * `systemMeta.communityFeedback` (admin notice), preserving sibling keys.
 * When the denial threshold lands (≥5 denials AND Wilson upper bound < 0.5)
 * on a still-unverified event, the listing flips to `denied` + draft — the
 * community verdict unpublishes it.
 */
export const syncCommunityFeedback: CollectionAfterChangeHook = async ({
  data,
  doc,
  previousDoc,
  req,
}) => {
  // ⚠ The type guard is not redundant with the vote check below it. On a
  // **create** `previousDoc` is undefined, so `null === undefined` is false and
  // a row that never carried a vote still passes that check — which on the old
  // single-purpose collection only ever meant a registration. Here it would fire
  // on every proposal and every spawned subscribe row that names an event,
  // paying for two counts and an Events write per create.
  //
  // `data` first, as `gateEventFeedback` above reads it: `doc` is the
  // `afterRead` projection, which a caller-set `select` narrows (#1093). No
  // client may write this column — the vote's one writer is the feedback page's
  // server action — so this is consistency, not a reachable hole. The vote is
  // read by presence rather than `??`, because clearing it sends `null`.
  if ((data.type ?? doc.type) !== 'registration') return doc
  const feedback = 'eventFeedback' in data ? data.eventFeedback : doc.eventFeedback
  if (feedback === previousDoc?.eventFeedback) return doc
  const eventId = relationId(data.event ?? doc.event)
  if (eventId == null) return doc

  const trustedReq = asTrustedReq(req)
  /**
   * Distinct registrants, counted by Postgres. Each registrant votes once, so
   * registering twice buys no second vote.
   *
   * ⚠ **A row with no registrant is one bucket, not one vote each.** An
   * anonymous registration carries no `user` — `prepareUserSubmission` sets it
   * only from a `senderEmail` — and the hand-built `Set` this replaced keyed
   * such a row on its own id, so every one of them counted. DISTINCT folds
   * them together instead, which is the cap the rule asks for.
   *
   * ⚠ **Passing a `limit` would undo that.** The adapter's paginating branch
   * counts with `COUNT(DISTINCT …)`, which drops NULL entirely; only the
   * unpaginated branch returns the NULL group as a value of its own.
   */
  const countVotes = async (vote: 'confirmed' | 'denied') => {
    const { totalDocs } = await req.payload.findDistinct({
      collection: 'user-submissions',
      field: 'user',
      // `activeRegistrationWhere`, not a bare `type` predicate: a row flagged
      // `spam` after its follow-up token was minted frees its seat, so it must
      // not keep a share of the power to unpublish the listing. Five denials
      // past the Wilson bound flip the event to `denied` + draft.
      where: {
        and: [
          { event: { equals: eventId } },
          activeRegistrationWhere,
          { eventFeedback: { equals: vote } },
        ],
      },
      depth: 0,
      overrideAccess: true,
      req: trustedReq,
    })
    return totalDocs
  }
  // All three are independent reads — the event's current state doesn't depend
  // on the tallies — so one round trip instead of two in an afterChange hook.
  const [confirmations, denials, event] = await Promise.all([
    countVotes('confirmed'),
    countVotes('denied'),
    req.payload.findByID({
      collection: 'events',
      id: eventId,
      depth: 0,
      select: { systemMeta: true, verificationStage: true },
      overrideAccess: true,
      req: trustedReq,
    }),
  ])
  const verdict = computeCommunityVerdict({ confirmations, denials })

  // Bookkeeping, so it must not re-validate the stored event. This hook is
  // unguarded, so a throw killed the visitor's transaction: the vote was rolled
  // back behind "Could not record your answer" (#842). The denial branch still
  // unpublishes — that is the community verdict, not editor content.
  const tally: EventBookkeeping = {
    confidenceScore: verdict.score,
    systemMeta: {
      ...(isRecord(event.systemMeta) ? event.systemMeta : {}),
      communityFeedback: { confirmations, denials, updatedAt: new Date().toISOString() },
    },
  }

  // A SYSTEM write in the caller's transaction — see `asSystemReq` for why
  // `overrideAccess` alone isn't enough (filterOptions still sees `req.user`).
  const systemReq = asSystemReq(req)
  const write = (data: EventBookkeeping, context?: RequestContext) =>
    updateEventBookkeeping({
      payload: req.payload,
      id: eventId,
      data,
      context: { ...context, skipWriteGuard: true },
      req: systemReq,
    })

  if (verdict.denied && event.verificationStage === 'unverified') {
    await transition({
      payload: req.payload,
      machine: EVENT_MACHINE,
      collection: 'events',
      id: eventId,
      from: 'unverified',
      to: 'denied',
      by: 'community',
      data: { ...tally, _status: 'draft' },
      write: ({ data, context }) => write(data as EventBookkeeping, context),
    })
    return doc
  }

  await write(tally)

  return doc
}
