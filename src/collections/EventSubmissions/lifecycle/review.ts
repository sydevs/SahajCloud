import type { Payload, PayloadRequest } from 'payload'

import { APIError } from 'payload'

import { relationId } from '@/lib/utilities/relationId'
import { getServerUrl } from '@/lib/utilities/serverUrl'
import { signToken, verifyToken, type SignedTokenResult } from '@/lib/utilities/signedToken'
import { DAY_MS } from '@/lib/utilities/time'
import type { EventSubmission } from '@/payload-types'

import { OPEN_SUBMISSION_STATUSES, type SubmissionStatus } from '../EventSubmissions'
import { submissionEventPatch } from './mapToEvent'

/**
 * Shared review semantics for an event submission — the one place Accept and
 * Reject actually happen, called by the admin Accept/Reject buttons' endpoint
 * and by the tokenized email-link page. Kept off the route/component layer so
 * it's testable with a plain `payload` instance.
 */

export type ReviewAction = 'accept' | 'reject'

export interface ReviewResult {
  /** The submission's terminal status after the review. */
  status: SubmissionStatus
  submission: EventSubmission
  /** The created/updated event id, on accept. */
  eventId?: number
}

// ---------------------------------------------------------------------------
// Tokenized email link
// ---------------------------------------------------------------------------

const REVIEW_TOKEN_KIND = 'event-submission-review'

/** 30 days: a review email may sit in an inbox a while; the page re-checks status anyway. */
export const REVIEW_TOKEN_TTL_MS = 30 * DAY_MS

export interface ReviewTokenClaims {
  submissionId: number
  /** Null when the review email fell back to the system contact. */
  managerId: number | null
}

export function signReviewToken(
  claims: ReviewTokenClaims,
  secret: string,
  now: Date = new Date(),
): string {
  return signToken(
    { ...claims },
    { kind: REVIEW_TOKEN_KIND, ttlMs: REVIEW_TOKEN_TTL_MS },
    secret,
    now,
  )
}

export function verifyReviewToken(
  token: string | null | undefined,
  secret: string,
  now: Date = new Date(),
): SignedTokenResult<ReviewTokenClaims> {
  return verifyToken<ReviewTokenClaims>(token, REVIEW_TOKEN_KIND, secret, now)
}

/**
 * Absolute URL of the SahajCloud-hosted review page (mirrors the
 * `/events/verify` pattern: the email link opens a confirmation page; the
 * mutation runs on that page's explicit button, never on the GET — mail
 * scanners prefetch links).
 */
export function buildReviewEmailLink(token: string, action?: ReviewAction): string {
  const params = new URLSearchParams({ token })
  if (action) params.set('action', action)
  return `${getServerUrl()}/submissions/review?${params.toString()}`
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
  const patch = submissionEventPatch(submission)

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

  const regionId = relationId(submission.region) ?? relationId(submission.anchorRegion)
  if (regionId == null) {
    throw new APIError(
      'This submission has no resolved city/venue yet — set an anchor region (or wait for screening) before accepting.',
      409,
      { code: 'region_unresolved' },
      true,
    )
  }

  const created = await payload.create({
    collection: 'events',
    data: {
      languages: ['en'],
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
