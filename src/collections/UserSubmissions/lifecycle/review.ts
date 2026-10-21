import type { Payload, PayloadRequest } from 'payload'

import { APIError } from 'payload'

import { appendLogEntry, asLog } from '@/fields'
import { relationId } from '@/lib/utilities/relationId'
import type { UserSubmission } from '@/payload-types'

import { OPEN_REVIEW_STATUSES, REOPENABLE_REVIEW_STATUSES } from '../statuses'
import { newEventDefaults, type ProposedPatch, submissionRegionId } from './mergeProposal'

/**
 * What Accept, Reject and Reopen actually do to a `proposal` submission — the
 * one implementation, reached by moving the row's `status`.
 *
 * The transition itself is the form's own update: `WorkflowButtons` submits
 * `{ status: 'accepted' }`, `guardStatusTransition` decides whether that move
 * is allowed, and `applyReviewDecision` calls in here afterwards. So nothing
 * below writes `status`, and nothing below re-reads the row — an edit a
 * reviewer made in the same post (a corrected `region`) is already in the
 * document it is handed.
 */

export type ReviewAction = 'accept' | 'reject' | 'reopen'

/**
 * The context flag {@link applyReview}'s own `payload.update` carries, so the
 * `afterChange` hook that called it does not fire on it again.
 */
export const SKIP_REVIEW_CONTEXT = 'skipSubmissionReview'

/**
 * Why a new-event accept cannot proceed. One wording, raised as a field error
 * on `region` by the guard and as the narrowing below — a reviewer fixes it in
 * the field the message names.
 */
export const NO_REGION_MESSAGE =
  'This submission has no resolved city/venue yet — set the Region field (or wait for screening) before accepting.'

const isOpen = (status: UserSubmission['status']) =>
  (OPEN_REVIEW_STATUSES as readonly string[]).includes(status)

const isReopenable = (status: UserSubmission['status']) =>
  (REOPENABLE_REVIEW_STATUSES as readonly string[]).includes(status)

/**
 * Which review decision a status move is, or `null` for a move no reviewer may
 * make — `accepted` → `pending`, a second accept on a decided row, any move to
 * `spam` or `failed` (the machine's own states).
 *
 * The guard and the hook that applies the decision read the same answer, so the
 * move the form is allowed to post and the work that then runs cannot disagree.
 */
export function reviewActionFor(
  from: UserSubmission['status'],
  to: UserSubmission['status'],
): ReviewAction | null {
  if (isOpen(from) && to === 'accepted') return 'accept'
  if (isOpen(from) && to === 'rejected') return 'reject'
  if (isReopenable(from) && to === 'pending') return 'reopen'
  return null
}

/**
 * Record a decision, and for an accept write the event it approves.
 *
 * Accept:
 * - update proposal (`event` set) → the proposed patch is applied with a
 *   plain `payload.update` — partial data merges field-wise, and the
 *   verify-on-save hook re-verifies a managed event exactly as any manager
 *   edit would (an unverified target stays unverified);
 * - new event → created **published**, attached to the reviewer-set `region`
 *   (falling back to the screening-resolved anchor). `unverified` by default —
 *   accepting only vouches "not spam" — unless the reviewer also named a
 *   `manager` on the submission, which adopts and verifies it in the same act.
 */
export async function applyReview(args: {
  payload: Payload
  /** The row as the review's own update left it, `status` already moved. */
  submission: UserSubmission
  action: ReviewAction
  /** Reviewing manager (null for a system decision). */
  managerId: number | null
  req?: PayloadRequest
  now?: Date
}): Promise<void> {
  const { payload, submission, action, managerId, req, now = new Date() } = args

  /**
   * Record the decision on the row's own log — `user-submissions` has one.
   *
   * Still a second write, rather than something the review's own update could
   * have carried: on a new-event accept it stamps the `event` relationship, and
   * that id does not exist until the create below has run.
   */
  const decide = (activity: string, extra?: Record<string, unknown>) =>
    payload.update({
      collection: 'user-submissions',
      id: submission.id,
      data: {
        ...extra,
        activityLog: appendLogEntry(asLog(submission.activityLog), {
          at: now.toISOString(),
          type: 'review',
          managerId,
          cells: { activity },
        }),
      },
      overrideAccess: true,
      context: { skipWriteGuard: true, [SKIP_REVIEW_CONTEXT]: true },
      req,
    })

  if (action === 'reopen') {
    // A screening false positive, or a rejection a manager wants back.
    await decide('Reopened for review')
    return
  }

  if (action === 'reject') {
    await decide('Rejected')
    return
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
    await decide(`Accepted — changes applied to event #${targetEventId}`)
    return
  }

  const regionId = submissionRegionId(submission)
  // `guardStatusTransition` refuses the move to `accepted` without one, so this
  // narrows rather than refusing a second time.
  if (regionId == null) {
    throw new APIError(NO_REGION_MESSAGE, 409, { code: 'region_unresolved' }, true)
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

  await decide(`Accepted — event #${created.id as number} created`, { event: created.id })
}
