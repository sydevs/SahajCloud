import type { PayloadRequest } from 'payload'

import { appendLogEntry } from '@/lib/atomicWrites/appendLogEntry'
import { runQueueSoon } from '@/lib/jobs/runQueueSoon'
import { relationId } from '@/lib/utilities/relationId'
import type { UserSubmission } from '@/payload-types'

import { NO_REGION_MESSAGE, type ReviewAction } from '../machine'
import { newEventDefaults, type ProposedPatch, submissionRegionId } from './mergeProposal'

/**
 * Record a decision, and for an accept write the event it approves.
 *
 * Nothing here writes `status`: the review's own update already did, which is
 * also why `submission` is the document that update wrote rather than a fresh
 * read — an edit the reviewer made in the same post is already in it.
 *
 * A spam decision is a status move whose effect is which rows
 * `INACTIVE_STATUSES`, the spam-strike count and the admin's open items select;
 * releasing a sign-up or message also queues the delivery screening withheld,
 * which is the same work a resend queues after a send that failed.
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
  req: PayloadRequest
  /** The row as the review's own update left it, `status` already moved. */
  submission: UserSubmission
  action: ReviewAction
  /** Who decided. */
  managerId: number | null
}): Promise<void> {
  const { req, submission, action, managerId } = args
  const payload = req.payload
  const now = new Date()

  /**
   * Record the decision on the row's own log — `user-submissions` has one.
   *
   * Still a second write, rather than something the review's own update could
   * have carried: on a new-event accept it stamps the `event` relationship, and
   * that id does not exist until the create below has run.
   */
  const decide = async (activity: string, extra?: Record<string, unknown>) => {
    if (extra) {
      await payload.update({
        collection: 'user-submissions',
        id: submission.id,
        data: extra,
        // Nothing reads the result, and `depth: 0` is what stops Payload paying
        // for it: at the config's default depth this row's afterRead populates
        // six relationships and recomputes both virtual review projections — a
        // second `mergeProposal` and a second whole-Events diff per decision.
        depth: 0,
        overrideAccess: true,
        // This write forwards the reviewing manager's `req`, so the review hook
        // would see it too. It moves no status, so the machine already answers
        // `unchanged` — the flag is the belt, because a recursion here would
        // create an event per turn.
        context: { skipSubmissionReview: true, skipWriteGuard: true },
        req,
      })
    }
    await appendLogEntry({
      payload,
      collection: 'user-submissions',
      id: submission.id,
      entry: { at: now.toISOString(), type: 'review', managerId, cells: { activity } },
      req,
    })
  }

  if (action === 'confirm-spam') {
    await decide('Confirmed as spam')
    return
  }

  if (action === 'reopen' && submission.type === 'proposal') {
    // A screening false positive, or a rejection a manager wants back.
    await decide('Reopened for review')
    return
  }

  if (action === 'reopen' || action === 'resend') {
    // ⚠ A released sign-up or message was never delivered: screening queues
    // delivery only on a pass, so releasing it must queue what that pass would
    // have. A resend is the same act for the other reason — the send itself
    // failed — and both leave the row `pending` for the delivery job to settle.
    await decide(action === 'resend' ? 'Queued for delivery again' : 'Released as not spam')
    await payload.jobs.queue({
      task: 'deliverSubmission',
      input: { submissionId: submission.id },
      queue: 'screening',
      req,
    })
    runQueueSoon({
      payload,
      queue: 'screening',
      label: 'applyReview',
      context: { submissionId: submission.id },
      afterCommit: true,
    })
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
      // Nothing reads the result. Without this, Events' afterRead runs the whole
      // listing-quality registry plus `webUrl` and `upcomingDates` for it.
      depth: 0,
      overrideAccess: true,
      context: { skipWriteGuard: true },
      req,
    })
    await decide(`Accepted — changes applied to event #${targetEventId}`)
    return
  }

  const regionId = submissionRegionId(submission)
  // The accept move's own condition refuses a write without one, so this
  // narrows rather than refusing a second time.
  if (regionId == null) throw new Error(NO_REGION_MESSAGE)

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
    // Only `id` is read below; see the update above for what the decoration costs.
    depth: 0,
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
