import type { CollectionAfterChangeHook } from 'payload'

import type { UserSubmission } from '@/payload-types'

import { applyReview, reviewActionFor, SKIP_REVIEW_CONTEXT } from '../lifecycle/review'

/**
 * afterChange (update): a manager moved `status`, so apply what that decision
 * means — write the event an accept approves, and log the decision.
 *
 * ⚠ **`afterChange`, not `beforeChange`.** A collection `beforeChange` runs
 * *ahead* of field validation (`payload/dist/collections/operations/utilities/update.js`),
 * so an event created there would be written before the document justifying it
 * had been validated. This runs after the write and before `commitTransaction`
 * (`payload/dist/collections/operations/updateByID.js`, where the commit is the
 * last statement before the `catch` that kills the transaction), so a throw in
 * here still takes the whole update back.
 *
 * The transition was already judged by `guardStatusTransition`, which binds the
 * same writes on the same rule — so reaching here means the move is one a
 * reviewer may make.
 */
export const applyReviewDecision: CollectionAfterChangeHook = async ({
  context,
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (operation !== 'update') return doc
  if (req.user?.collection !== 'managers') return doc
  // `applyReview`'s own update to this row carries the flag, or logging the
  // decision would be read as a second one.
  if (context[SKIP_REVIEW_CONTEXT]) return doc

  const submission = doc as UserSubmission
  if (submission.type !== 'proposal') return doc

  const action = reviewActionFor((previousDoc as UserSubmission).status, submission.status)
  if (!action) return doc

  await applyReview({
    payload: req.payload,
    // The document the update just wrote, so a `region` the reviewer corrected
    // in the same post is the one the accept uses.
    submission,
    action,
    managerId: typeof req.user.id === 'number' ? req.user.id : null,
    req,
  })

  return doc
}
