import type { CollectionAfterChangeHook } from 'payload'

import { judgeTransition } from '@/lib/stateMachine/guard'
import type { UserSubmission } from '@/payload-types'

import { applyReview } from '../lifecycle/review'
import { type ReviewAction, SUBMISSION_MACHINE } from '../machine'

/**
 * afterChange (update): apply what the status move a person just posted
 * means — write the event an accept approves, and log the decision.
 *
 * The decision is the name of the move `SUBMISSION_MACHINE` matched, judged
 * the same way the column's guard judged it on this write: a system writer's
 * move carries no name, and a refused one never reaches here.
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
  data,
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (operation !== 'update') return doc
  // `applyReview`'s own write to this row forwards the same `req`.
  //
  // ⚠ **Keyed on the row, because the flag outlives the write that set it.**
  // `createLocalReq` assigns a nested write's context onto the request it was
  // handed, and a bulk update runs every document on one `req` — so a boolean
  // here let one accept's follow-up write skip another row's decision, leaving
  // it `accepted` with no event and no log entry.
  if (context.skipSubmissionReview === (doc as UserSubmission).id) return doc

  const previous = previousDoc as UserSubmission
  const verdict = judgeTransition({
    machine: SUBMISSION_MACHINE,
    from: previous.status,
    // The patch, as the guard read it: an absent key moved nothing.
    to: ('status' in data ? data.status : undefined) as UserSubmission['status'] | undefined,
    doc: { ...previous, ...data } as Partial<UserSubmission>,
    req,
    context,
  })
  if (verdict.kind !== 'allowed' || !verdict.move.name) return doc

  await applyReview({
    req,
    // The document the update just wrote, so a `region` the reviewer corrected
    // in the same post is the one the accept uses.
    submission: doc as UserSubmission,
    action: verdict.move.name as ReviewAction,
    managerId: typeof req.user?.id === 'number' ? req.user.id : null,
  })

  return doc
}
