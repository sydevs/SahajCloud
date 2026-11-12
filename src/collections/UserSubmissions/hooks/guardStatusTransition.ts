import type { CollectionBeforeChangeHook } from 'payload'

import { ValidationError } from 'payload'

import { judgeTransition, refuseTransition, resolveActor } from '@/lib/stateMachine/guard'
import { relationId } from '@/lib/utilities/relationId'
import type { UserSubmission } from '@/payload-types'

import { submissionRegionId } from '../lifecycle/mergeProposal'
import { NO_REGION_MESSAGE, reviewMove } from '../lifecycle/review'
import { SUBMISSION_ACTORS, SUBMISSION_MACHINE } from '../machine'

/**
 * beforeChange (update): refuse a status move nobody may make, and report it.
 *
 * ⚠ **This closes a gap as much as it plumbs the review buttons.** `status`
 * carries `systemFieldAccess`, which denies `clients` and allows every manager,
 * and `admin.readOnly` is the admin UI alone — `readOnly` appears nowhere under
 * `payload/dist/fields/hooks/`. So before this hook a manager holding
 * `user-submissions: update` could `PATCH` `status` to any value, with nothing
 * checking the transition and nothing applying the decision.
 *
 * **Two writers, two answers.** A manager at the keyboard is `reviewMove`'s:
 * it names the decision `applyReviewDecision` then acts on, and refuses in
 * words a reviewer can do something about. Everything else is a job, an
 * endpoint or a hook, and `SUBMISSION_MACHINE` is its whole gate — before
 * #1121 those writers were exempt by construction, since `reviewMove` answers
 * `none` for a request carrying no manager, so each could write any status
 * from anywhere.
 *
 * The two cannot drift apart: `user-submissions-review-lifecycle.int.spec.ts`
 * puts every move in the table through `reviewMove`, and every move
 * `reviewMove` grants through the table.
 */
export const guardStatusTransition: CollectionBeforeChangeHook = ({
  collection,
  context,
  data,
  originalDoc,
  req,
}) => {
  // No original document means a create, where `status` is the column's own
  // default or a system writer's choice — there is no transition to judge.
  const previous = originalDoc as UserSubmission | undefined
  if (!previous) return data

  // A collection `beforeChange` receives the incoming patch, not the merged
  // document, so an absent key means the write left that field alone.
  const to = ('status' in data ? data.status : undefined) as UserSubmission['status'] | undefined

  const refuse = (reason: string, by: string | null): never =>
    refuseTransition({
      machine: SUBMISSION_MACHINE,
      collection: collection?.slug ?? 'user-submissions',
      from: previous.status,
      to,
      by,
      reason,
      req,
    })

  // ⚠ **A declared writer wins, whoever's request carries it.** A system write
  // can ride a manager's own request — the seed importer runs as an admin, and
  // the repeat-signup fold runs inside a client's create — and judging those by
  // what the request's user may do would refuse a move the writer is for.
  const by = resolveActor({
    actors: SUBMISSION_ACTORS,
    // No system writer is a person, so there is nobody to fall back to: a
    // writer that names itself is the whole of this gate.
    actorFromRequest: () => null,
    req,
    context,
  })

  if (by !== null || req.user?.collection !== 'managers') {
    const verdict = judgeTransition({ machine: SUBMISSION_MACHINE, from: previous.status, to, by })
    if (verdict.kind === 'illegal') refuse(verdict.reason, by)
    return data
  }

  const move = reviewMove({
    from: previous.status,
    to,
    type: (data.type ?? previous.type) as UserSubmission['type'],
    req,
  })

  if (move.kind === 'none') return data

  if (move.kind === 'illegal') {
    refuse(move.reason, 'review')
  } else if (move.action === 'accept') {
    // Refused here rather than where the event is created, so it lands on the
    // field that fixes it: `region` is editable on an unresolved proposal, and
    // a reviewer correcting it and pressing Accept again is one click.
    // ⚠ **An explicit `null` is not an absent key.** The document form posts
    // every field, so a reviewer who clears Region posts `region: null` — and
    // `??` reads the stored value for that as readily as for a field the write
    // never named. The gate then passed a row whose written `region` is empty,
    // leaving `applyReview` to refuse it with a bare `Error` no field can
    // render.
    const written = (field: 'event' | 'region') => (field in data ? data[field] : previous[field])

    const event = relationId(written('event'))
    const region = submissionRegionId({ region: written('region') })
    if (event == null && region == null) {
      throw new ValidationError({ errors: [{ path: 'region', message: NO_REGION_MESSAGE }] })
    }
  }

  return data
}
