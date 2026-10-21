import type { CollectionBeforeChangeHook } from 'payload'

import { ValidationError } from 'payload'

import { relationId } from '@/lib/utilities/relationId'
import type { UserSubmission } from '@/payload-types'

import { submissionRegionId } from '../lifecycle/mergeProposal'
import { NO_REGION_MESSAGE, reviewMove } from '../lifecycle/review'

/**
 * beforeChange (update): refuse a status move no reviewer may make.
 *
 * ⚠ **This closes a gap as much as it plumbs the review buttons.** `status`
 * carries `systemFieldAccess`, which denies `clients` and allows every manager,
 * and `admin.readOnly` is the admin UI alone — `readOnly` appears nowhere under
 * `payload/dist/fields/hooks/`. So before this hook a manager holding
 * `user-submissions: update` could `PATCH` `status` to any value, with nothing
 * checking the transition and nothing applying the decision.
 *
 * Who may decide, and which moves count, is `reviewMove`'s answer — the same
 * one `applyReviewDecision` acts on.
 */
export const guardStatusTransition: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  // No original document means a create, where `status` is the column's own
  // default or a system writer's choice — there is no transition to judge.
  const previous = originalDoc as UserSubmission | undefined
  if (!previous) return data

  const move = reviewMove({
    from: previous.status,
    // A collection `beforeChange` receives the incoming patch, not the merged
    // document, so an absent key means the write left that field alone.
    to: data.status as UserSubmission['status'] | undefined,
    type: (data.type ?? previous.type) as UserSubmission['type'],
    req,
  })

  if (move.kind === 'none') return data
  if (move.kind === 'illegal') {
    throw new ValidationError({ errors: [{ path: 'status', message: move.reason }] })
  }

  // Refused here rather than where the event is created, so it lands on the
  // field that fixes it: `region` is editable on an unresolved proposal, and a
  // reviewer correcting it and pressing Accept again is one click.
  if (move.action === 'accept') {
    // ⚠ **An explicit `null` is not an absent key.** The document form posts
    // every field, so a reviewer who clears Region posts `region: null` — and
    // `??` reads the stored value for that as readily as for a field the write
    // never named. The gate then passed a row whose written `region` is empty,
    // leaving `applyReview` to refuse it with a bare `Error` no field can
    // render.
    const written = (field: 'event' | 'region' | 'regionHint') =>
      field in data ? data[field] : previous[field]

    const event = relationId(written('event'))
    const region = submissionRegionId({
      region: written('region'),
      regionHint: written('regionHint'),
    })
    if (event == null && region == null) {
      throw new ValidationError({ errors: [{ path: 'region', message: NO_REGION_MESSAGE }] })
    }
  }

  return data
}
