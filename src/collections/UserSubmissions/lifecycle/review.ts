import type { Payload, PayloadRequest } from 'payload'

import { APIError } from 'payload'

import { appendLogEntry, asLog } from '@/fields'
import { relationId } from '@/lib/utilities/relationId'
import type { UserSubmission } from '@/payload-types'

import { OPEN_REVIEW_STATUSES, REOPENABLE_REVIEW_STATUSES } from '../statuses'
import { newEventDefaults, type ProposedPatch, submissionRegionId } from './mergeProposal'

/**
 * Shared review semantics for a `proposal` submission — the one place Accept
 * and Reject actually happen, called by the admin Accept/Reject buttons'
 * endpoint. Kept off the route/component layer so it's testable with a plain
 * `payload` instance.
 */

export type ReviewAction = 'accept' | 'reject' | 'reopen'

/**
 * What the decision did, as distinct from the row's status.
 *
 * `user-submissions` carries one five-state vocabulary for every type, so an
 * accept is `accepted` whether it created a listing or patched one. The
 * flavour a reviewer needs — and the toast wording — lives here and in the
 * `activityLog` entry, not in a sixth status.
 */
export type ReviewOutcome = 'created' | 'updated' | 'rejected' | 'reopened' | 'already-decided'

export interface ReviewResult {
  /** The submission's status after the review. */
  status: UserSubmission['status']
  /** What the decision did. */
  outcome: ReviewOutcome
  submission: UserSubmission
  /** The created/updated event id, on accept. */
  eventId?: number
}

const isOpen = (status: UserSubmission['status']) =>
  (OPEN_REVIEW_STATUSES as readonly string[]).includes(status)

const isReopenable = (status: UserSubmission['status']) =>
  (REOPENABLE_REVIEW_STATUSES as readonly string[]).includes(status)

/**
 * Apply a review decision. Idempotent-ish: a submission already in a terminal
 * state is returned unchanged (`outcome` tells the caller what happened
 * before), so a re-clicked email link reads as "already handled" rather than
 * double-creating an event.
 *
 * Accept:
 * - update proposal (`event` set) → the proposed patch is applied with a
 *   plain `payload.update` — partial data merges field-wise, and the
 *   verify-on-save hook re-verifies a managed event exactly as any manager
 *   edit would (an unverified target stays unverified);
 * - new event → created **published**, attached to the screening-resolved
 *   `region` (falling back to the submitter's anchor). `unverified` by
 *   default — accepting only vouches "not spam" — unless the reviewer also
 *   named a `manager` on the submission, which adopts and verifies it in the
 *   same act.
 */
export async function applyReview(args: {
  payload: Payload
  submissionId: number
  action: ReviewAction
  /** Reviewing manager (null for a system decision). */
  managerId: number | null
  req?: PayloadRequest
  now?: Date
}): Promise<ReviewResult> {
  const { payload, submissionId, action, managerId, req, now = new Date() } = args

  const submission = (await payload.findByID({
    collection: 'user-submissions',
    id: submissionId,
    depth: 0,
    overrideAccess: true,
    req,
  })) as UserSubmission

  // One table holds four intakes, so the review path has to say which one it
  // acts on. Without this a `contact` row would reach `newEventDefaults` with
  // no `proposed` and create an empty listing.
  if (submission.type !== 'proposal') {
    throw new APIError(
      `A ${submission.type} submission is not reviewable.`,
      409,
      { code: 'not_reviewable' },
      true,
    )
  }

  /** Record the decision on the row's own log — `user-submissions` has one. */
  const decide = (
    status: UserSubmission['status'],
    activity: string,
    extra?: Record<string, unknown>,
  ) =>
    payload.update({
      collection: 'user-submissions',
      id: submissionId,
      data: {
        status,
        ...extra,
        activityLog: appendLogEntry(asLog(submission.activityLog), {
          at: now.toISOString(),
          type: 'review',
          managerId,
          cells: { activity },
        }),
      },
      overrideAccess: true,
      context: { skipWriteGuard: true },
      req,
    }) as Promise<UserSubmission>

  if (action === 'reopen') {
    // A screening false positive, or a rejection a manager wants back.
    if (!isReopenable(submission.status)) {
      throw new APIError(
        `A ${submission.status} submission cannot be reopened.`,
        409,
        { code: 'not_reopenable' },
        true,
      )
    }
    const reopened = await decide('pending', 'Reopened for review')
    return { status: 'pending', outcome: 'reopened', submission: reopened }
  }

  if (!isOpen(submission.status)) {
    return { status: submission.status, outcome: 'already-decided', submission }
  }

  if (action === 'reject') {
    const updated = await decide('rejected', 'Rejected')
    return { status: 'rejected', outcome: 'rejected', submission: updated }
  }

  const targetEventId = relationId(submission.event)
  const patch = (submission.proposed ?? {}) as ProposedPatch

  if (targetEventId != null) {
    // Update proposal: apply the patch as a normal save (verifyOnSave runs).
    await payload.update({
      collection: 'events',
      id: targetEventId,
      data: patch,
      overrideAccess: true,
      context: { skipWriteGuard: true },
      req,
    })
    const updated = await decide('accepted', `Accepted — changes applied to event #${targetEventId}`)
    return { status: 'accepted', outcome: 'updated', submission: updated, eventId: targetEventId }
  }

  const regionId = submissionRegionId(submission)
  if (regionId == null) {
    throw new APIError(
      'This submission has no resolved city/venue yet — set the Region field (or wait for screening) before accepting.',
      409,
      { code: 'region_unresolved' },
      true,
    )
  }

  // Optional, and only meaningful here: assigning one adopts the listing on
  // creation instead of leaving it on the map as unverified.
  const assignedManagerId = relationId(submission.manager)

  const created = await payload.create({
    collection: 'events',
    data: {
      // `newEventDefaults` is the whole contract — including the derived
      // `inactive` (no schedule proposed → a dormant listing, whose contact
      // info the Events validation then requires) and `_status`. The preview
      // and the diff compose from the same function, so what a reviewer
      // approves is what gets written.
      ...newEventDefaults(patch, assignedManagerId),
      ...patch,
      region: regionId,
      // The submitter is `system.user` here — the same `upsertUserByEmail`
      // result `event-submissions` stored under its own `submitter` column.
      submitter: relationId(submission.user),
    } as never,
    overrideAccess: true,
    // `skipVerifyHook` means "don't open a verification cycle", which is right
    // for an unadopted listing and wrong for an adopted one: with a manager
    // this save must take the same path as assigning a manager in the admin,
    // or the event would be stamped `verified` with no `nextCheckAt` and never
    // come up for re-verification again.
    context: { skipVerifyHook: assignedManagerId == null, skipWriteGuard: true },
    req,
  })

  const eventId = created.id as number
  const updated = await decide('accepted', `Accepted — event #${eventId} created`, {
    event: eventId,
  })
  return { status: 'accepted', outcome: 'created', submission: updated, eventId }
}
