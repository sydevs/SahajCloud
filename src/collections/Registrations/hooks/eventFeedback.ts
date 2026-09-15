import type { CollectionAfterChangeHook, CollectionBeforeChangeHook } from 'payload'

import { APIError } from 'payload'

import { computeCommunityVerdict } from '@/lib/eventVerification/communityFeedback'
import { isRecord } from '@/lib/utilities/isRecord'
import { relationId } from '@/lib/utilities/relationId'
import { asSystemReq, asTrustedReq } from '@/plugins/usage/hooks'

/**
 * Registrant confirm/deny voting on unverified events, carried on the
 * registration itself.
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
 * Recount (two indexed counts), never increment: concurrent votes converge on
 * the true tally instead of compounding a race. Writes the Wilson lower bound
 * to the indexed `confidenceScore` (feed ranking) and the tallies into
 * `systemMeta.communityFeedback` (admin notice), preserving sibling keys.
 * When the denial threshold lands (≥5 denials AND Wilson upper bound < 0.5)
 * on a still-unverified event, the listing flips to `denied` + draft — the
 * community verdict unpublishes it.
 */
export const syncCommunityFeedback: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  if (doc.eventFeedback === previousDoc?.eventFeedback) return doc
  const eventId = relationId(doc.event)
  if (eventId == null) return doc

  const trustedReq = asTrustedReq(req)
  const countVotes = (vote: 'confirmed' | 'denied') =>
    req.payload.count({
      collection: 'registrations',
      where: { and: [{ event: { equals: eventId } }, { eventFeedback: { equals: vote } }] },
      overrideAccess: true,
      req: trustedReq,
    })
  // All three are independent reads — the event's current state doesn't depend
  // on the tallies — so one round trip instead of two in an afterChange hook.
  const [confirmed, denied, event] = await Promise.all([
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
  const confirmations = confirmed.totalDocs
  const denials = denied.totalDocs
  const verdict = computeCommunityVerdict({ confirmations, denials })

  await req.payload.update({
    collection: 'events',
    id: eventId,
    data: {
      confidenceScore: verdict.score,
      systemMeta: {
        ...(isRecord(event.systemMeta) ? event.systemMeta : {}),
        communityFeedback: { confirmations, denials, updatedAt: new Date().toISOString() },
      },
      ...(verdict.denied && event.verificationStage === 'unverified'
        ? { verificationStage: 'denied', _status: 'draft' }
        : {}),
    },
    overrideAccess: true,
    context: { skipVerifyHook: true, skipWriteGuard: true },
    // A SYSTEM write in the caller's transaction — see `asSystemReq` for why
    // `overrideAccess` alone isn't enough (filterOptions still sees `req.user`).
    req: asSystemReq(req),
  })

  return doc
}
