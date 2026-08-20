import type { Payload, PayloadRequest } from 'payload'

import { APIError } from 'payload'

import { relationId } from '@/lib/utilities/relationId'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import type { EventSubmission } from '@/payload-types'

import { OPEN_SUBMISSION_STATUSES, type SubmissionStatus } from '../EventSubmissions'
import { NEW_EVENT_DEFAULTS, type ProposedPatch } from './mergeProposal'

/**
 * Shared review semantics for an event submission — the one place Accept and
 * Reject actually happen, called by the admin Accept/Reject buttons' endpoint.
 * Kept off the route/component layer so it's testable with a plain `payload`
 * instance.
 */

export type ReviewAction = 'accept' | 'reject' | 'reopen'

/**
 * Statuses `reopen` can rescue. Deliberately not `created` / `updated`: those
 * already wrote to an event, and reopening one would invite a second Accept
 * that created a duplicate listing or re-applied a patch a manager has since
 * edited away.
 */
export const REOPENABLE_STATUSES: readonly SubmissionStatus[] = ['spam', 'rejected']

export interface ReviewResult {
  /** The submission's terminal status after the review. */
  status: SubmissionStatus
  submission: EventSubmission
  /** The created/updated event id, on accept. */
  eventId?: number
}

// ---------------------------------------------------------------------------
// Email link
// ---------------------------------------------------------------------------

/**
 * Where the notification email sends the manager: the submission's own admin
 * edit view, which is now the only review surface.
 *
 * There is no token here by design. The standalone `/submissions/review` page
 * existed so a manager could act while logged out, at the cost of a second
 * implementation of Accept/Reject and a second rendering of the submission.
 * With the review collapsed onto the admin view — where the diff and the live
 * preview are — a signed link would only reach a page that already requires a
 * session.
 */
export function buildReviewEmailLink(submissionId: number): string {
  return `${getServerUrl()}/admin/collections/event-submissions/${submissionId}`
}

// ---------------------------------------------------------------------------
// The review operation
// ---------------------------------------------------------------------------

/**
 * Apply a review decision. Idempotent-ish: a submission already in a terminal
 * state is returned unchanged (`status` tells the caller what happened
 * before), so a re-clicked email link reads as "already handled" rather than
 * double-creating an event.
 *
 * Accept:
 * - update proposal (`event` set) → the proposed patch is applied with a
 *   plain `payload.update` — partial data merges field-wise, and the
 *   verify-on-save hook re-verifies a managed event exactly as any manager
 *   edit would (an unverified target stays unverified);
 * - new event → created **published + `unverified`** (no manager — accepting
 *   only vouches "not spam"; adoption is a separate act), attached to the
 *   screening-resolved `region` (falling back to the submitter's anchor).
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
    collection: 'event-submissions',
    id: submissionId,
    depth: 0,
    overrideAccess: true,
    req,
  })) as EventSubmission

  if (action === 'reopen') {
    // A screening false positive, or a rejection a manager wants back. Clears
    // the review stamp so the submission reads as genuinely pending again.
    if (!REOPENABLE_STATUSES.includes(submission.status)) {
      throw new APIError(
        `A ${submission.status} submission cannot be reopened.`,
        409,
        { code: 'not_reopenable' },
        true,
      )
    }
    const reopened = (await payload.update({
      collection: 'event-submissions',
      id: submissionId,
      data: { status: 'pending', reviewedBy: null, reviewedAt: null },
      overrideAccess: true,
      context: { skipWriteGuard: true },
      req,
    })) as EventSubmission
    return { status: 'pending', submission: reopened }
  }

  if (!OPEN_SUBMISSION_STATUSES.includes(submission.status)) {
    return { status: submission.status, submission }
  }

  const stampReview = (status: SubmissionStatus, eventId?: number) =>
    payload.update({
      collection: 'event-submissions',
      id: submissionId,
      data: {
        status,
        ...(eventId != null ? { event: eventId } : {}),
        reviewedBy: managerId,
        reviewedAt: now.toISOString(),
      },
      overrideAccess: true,
      context: { skipWriteGuard: true },
      req,
    }) as Promise<EventSubmission>

  if (action === 'reject') {
    const updated = await stampReview('rejected')
    return { status: 'rejected', submission: updated }
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
    const updated = await stampReview('updated', targetEventId)
    return { status: 'updated', submission: updated, eventId: targetEventId }
  }

  const hint = (submission.regionHint ?? {}) as Record<string, unknown>
  const regionId = relationId(submission.region) ?? relationId(hint.anchorRegion)
  if (regionId == null) {
    throw new APIError(
      'This submission has no resolved city/venue yet — set the Region field (or wait for screening) before accepting.',
      409,
      { code: 'region_unresolved' },
      true,
    )
  }

  const created = await payload.create({
    collection: 'events',
    data: {
      ...NEW_EVENT_DEFAULTS,
      ...patch,
      region: regionId,
      submitter: relationId(submission.submitter),
      verificationStage: 'unverified',
      manager: null,
      // No schedule proposed → a dormant listing (its contact info is then
      // required by the Events validation — a failure here surfaces to the
      // reviewing manager, who can fill the gap on the submission and retry).
      inactive: patch.schedule == null,
      _status: 'published',
    } as never,
    overrideAccess: true,
    context: { skipVerifyHook: true, skipWriteGuard: true },
    req,
  })

  const updated = await stampReview('created', created.id as number)
  return { status: 'created', submission: updated, eventId: created.id as number }
}
