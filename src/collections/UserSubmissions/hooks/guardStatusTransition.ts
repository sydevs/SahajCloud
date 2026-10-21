import type { CollectionBeforeChangeHook } from 'payload'

import { ValidationError } from 'payload'

import { relationId } from '@/lib/utilities/relationId'
import type { UserSubmission } from '@/payload-types'

import { submissionRegionId } from '../lifecycle/mergeProposal'
import { NO_REGION_MESSAGE, reviewActionFor } from '../lifecycle/review'
import { STATUS_LABELS } from '../statuses'

/**
 * beforeChange (update): the only place a manager may move `status`, and the
 * only moves they may make.
 *
 * ⚠ **This closes a gap rather than only plumbing the review buttons.**
 * `status` carries `systemFieldAccess`, which denies `clients` and allows every
 * manager, and `admin.readOnly` is the admin UI alone — `readOnly` appears
 * nowhere under `payload/dist/fields/hooks/`. So before this hook a manager
 * holding `user-submissions: update` could `PATCH` `status` to any value, with
 * nothing checking the transition and nothing applying the decision.
 *
 * It binds a **manager's** write and nothing else, which is why no system
 * writer had to be changed: screening's `pending` → `spam` and delivery's moves
 * run on a job `req` that carries no manager, and a client cannot write the
 * field at all. A flag would have been the fragile way to say the same thing —
 * one an internal writer could drop the day its other reason for carrying it
 * went away.
 *
 * An ordinary save is let through on the one rule that matters for it: the form
 * posts the whole document, so every save re-posts the stored status, and a
 * move to the value already held is not a move.
 */
export const guardStatusTransition: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (req.user?.collection !== 'managers') return data
  // No original document means a create, where `status` is the column's own
  // default or a system writer's choice — there is no transition to judge.
  if (!originalDoc) return data

  const from = (originalDoc as UserSubmission).status
  const to = data?.status as UserSubmission['status'] | undefined
  if (to === undefined || to === from) return data

  // A collection `beforeChange` receives the incoming patch, not the merged
  // document, so the effective post-write state is the patch over the original.
  const merged = { ...(originalDoc as UserSubmission), ...data } as UserSubmission

  if (merged.type !== 'proposal') {
    // One table holds four intakes and they share one status vocabulary, so
    // without this a contact row could be walked through the review states and
    // reach the accept path with no `proposed` to apply.
    throw new ValidationError({
      errors: [{ path: 'status', message: `A ${merged.type} submission is not reviewable.` }],
    })
  }

  const action = reviewActionFor(from, to)
  if (!action) {
    throw new ValidationError({
      errors: [
        {
          path: 'status',
          message: `A ${STATUS_LABELS[from].toLowerCase()} submission cannot become ${STATUS_LABELS[to].toLowerCase()}.`,
        },
      ],
    })
  }

  // Refused here rather than where the event is created, so it lands on the
  // field that fixes it: `region` is editable on an unresolved proposal, and a
  // reviewer correcting it and pressing Accept again is one click.
  if (action === 'accept' && relationId(merged.event) == null && submissionRegionId(merged) == null) {
    throw new ValidationError({ errors: [{ path: 'region', message: NO_REGION_MESSAGE }] })
  }

  return data
}
