import type { CollectionAfterChangeHook } from 'payload'

import type { UserSubmission } from '@/payload-types'

import { applyReview, reviewMove } from '../lifecycle/review'

/**
 * afterChange (update): apply what the status move the reviewer just posted
 * means — write the event an accept approves, and log the decision.
 *
 * ⚠ **`afterChange`, not `beforeChange`.** A collection `beforeChange` runs
 * *ahead* of field validation (`payload/dist/collections/operations/utilities/update.js`),
 * so an event created there would be written before the document justifying it
 * had been validated. This runs after the write and before `commitTransaction`
 * (`payload/dist/collections/operations/updateByID.js`, where the commit is the
 * last statement before the `catch` that kills the transaction), so a throw in
 * here still takes the whole update back.
 */
export const applyReviewDecision: CollectionAfterChangeHook = async ({
  context,
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (operation !== 'update') return doc
  // `applyReview`'s own write to this row forwards the same `req`.
  if (context.skipSubmissionReview) return doc

  const submission = doc as UserSubmission
  const move = reviewMove({
    from: (previousDoc as UserSubmission).status,
    to: submission.status,
    type: submission.type,
    req,
  })
  // An `illegal` move never reaches here — `guardStatusTransition` refused it
  // on the same write, off this same answer.
  if (move.kind !== 'decision') return doc

  await applyReview({
    req,
    // The document the update just wrote, so a `region` the reviewer corrected
    // in the same post is the one the accept uses.
    submission,
    action: move.action,
    managerId: typeof req.user?.id === 'number' ? req.user.id : null,
  })

  return doc
}
