import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeValidateHook,
} from 'payload'

import { APIError } from 'payload'

import { computeCommunityVerdict } from '@/lib/eventVerification/communityFeedback'
import { isRecord } from '@/lib/utilities/isRecord'
import { relationId } from '@/lib/utilities/relationId'
import { asTrustedReq } from '@/plugins/usage/hooks'

/**
 * Registrant confirm/deny voting on unverified events, carried on the
 * registration itself (possession of the registration `uuid` is the vote's
 * authentication — see `registrationFeedbackAccess` in the access plugin).
 */

/**
 * beforeValidate: an API client updating a registration may write exactly one
 * field — `eventFeedback`. Every other field is reverted to its stored value
 * (the widget only ever sends the vote; anything more is a forged body, and a
 * 400 would leak which fields exist).
 *
 * Reverted, not stripped: on update Payload hands this hook `data` already
 * merged with the original document, and the merged object IS what gets
 * validated — returning only `{ eventFeedback }` would fail the collection's
 * own required fields. So the whitelist is expressed as "original doc +
 * the vote".
 */
export const restrictClientRegistrationUpdate: CollectionBeforeValidateHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (operation !== 'update' || req.user?.collection !== 'clients') return data
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...original
  } = (originalDoc ?? {}) as Record<string, unknown>
  return {
    ...original,
    eventFeedback: (data as { eventFeedback?: unknown } | undefined)?.eventFeedback,
  }
}

/**
 * beforeChange: gate + stamp a vote. Votes are only open while the event is
 * published and `unverified` — a denied event stops collecting votes (the
 * verdict landed), an adopted one no longer needs them (409 `feedback_closed`).
 * Re-voting while open is allowed and simply overwrites (idempotent recount).
 */
export const gateEventFeedback: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const incoming = data?.eventFeedback
  if (incoming === undefined || incoming === originalDoc?.eventFeedback) return data

  const eventId = relationId(data?.event ?? originalDoc?.event)
  if (eventId != null) {
    const event = await req.payload
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
      throw new APIError(
        'Feedback is closed for this event.',
        409,
        { code: 'feedback_closed' },
        true,
      )
    }
  }

  return { ...data, eventFeedbackAt: new Date().toISOString() }
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
  const [confirmed, denied] = await Promise.all([countVotes('confirmed'), countVotes('denied')])
  const confirmations = confirmed.totalDocs
  const denials = denied.totalDocs
  const verdict = computeCommunityVerdict({ confirmations, denials })

  const event = await req.payload.findByID({
    collection: 'events',
    id: eventId,
    depth: 0,
    select: { systemMeta: true, verificationStage: true },
    overrideAccess: true,
    req: trustedReq,
  })

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
    // A user-stripped copy (same transaction): this is a SYSTEM write, and
    // Payload validates the events `region` filterOptions against `req.user`
    // — a client user would flunk the owned-region filter and 400 the vote.
    req: { ...req, user: null } as typeof req,
  })

  return doc
}
