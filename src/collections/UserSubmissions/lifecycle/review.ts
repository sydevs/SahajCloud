import type { PayloadRequest } from 'payload'

import { appendLogEntry, asLog } from '@/fields'
import { relationId } from '@/lib/utilities/relationId'
import type { UserSubmission } from '@/payload-types'
import { holdsCollectionPermission } from '@/plugins/access'

import { OPEN_REVIEW_STATUSES, REOPENABLE_REVIEW_STATUSES, STATUS_LABELS } from '../statuses'
import { newEventDefaults, type ProposedPatch, submissionRegionId } from './mergeProposal'

export type ReviewAction = 'accept' | 'reject' | 'reopen'

/**
 * What one write means for review: nothing to judge, a move no reviewer may
 * make, or a decision to apply.
 */
export type ReviewMove =
  | { kind: 'decision'; action: ReviewAction }
  | { kind: 'illegal'; reason: string }
  | { kind: 'none' }

/**
 * Why a new-event accept cannot proceed. One wording, raised as a field error
 * on `region` by the guard and as the narrowing in {@link applyReview} — a
 * reviewer fixes it in the field the message names.
 */
export const NO_REGION_MESSAGE =
  'This submission has no resolved city/venue yet — set the Region field (or wait for screening) before accepting.'

const isOpen = (status: UserSubmission['status']) =>
  (OPEN_REVIEW_STATUSES as readonly string[]).includes(status)

const isReopenable = (status: UserSubmission['status']) =>
  (REOPENABLE_REVIEW_STATUSES as readonly string[]).includes(status)

/** Which decision a status move is, or `null` for one no reviewer may make. */
function actionFor(
  from: UserSubmission['status'],
  to: UserSubmission['status'],
): ReviewAction | null {
  if (isOpen(from) && to === 'accepted') return 'accept'
  if (isOpen(from) && to === 'rejected') return 'reject'
  if (isReopenable(from) && to === 'pending') return 'reopen'
  return null
}

/**
 * The whole review predicate, in one place: who may decide, on which rows, and
 * which moves count.
 *
 * ⚠ **Both hooks read this one answer.** `guardStatusTransition` refuses an
 * `illegal` move and `applyReviewDecision` applies a `decision`, so the move
 * the form is allowed to post and the work that then runs cannot disagree.
 * Spelled out at each hook, the two could drift on who counts as a reviewer or
 * on which rows are reviewable, with only the transition half shared.
 *
 * ⚠ **A reviewer is a manager holding the `update` grant, not merely a manager
 * named on the row.** The collection's own `update` is wider than its roles:
 * when the role grants deny, `createAccessConfig` falls back to document-level
 * manager access, so whoever a submission's `manager` field names may edit that
 * row with no grant at all (`accessConfigs.ts`). Reading the collection's
 * `update` here would make being assigned a proposal authority to publish the
 * Events row accepting it writes — which `POST :id/review` refused, gating on
 * the grant alone. `holdsCollectionPermission` is that same gate, minus the 403
 * an endpoint returns and a hook cannot.
 *
 * Nothing else binds, which is why no system writer had to change: screening's
 * `pending` → `spam` and delivery's moves run on a job `req` carrying no
 * manager, and a client cannot write the field at all. A per-writer opt-out
 * flag would fail in the dangerous direction — a future internal writer that
 * forgot one would have its write refused, or worse have an event created for a
 * decision no human made.
 */
export function reviewMove(args: {
  from: UserSubmission['status'] | undefined
  /** Absent means the write never named a status, so nothing moved. */
  to: UserSubmission['status'] | undefined
  type: UserSubmission['type']
  req: PayloadRequest
}): ReviewMove {
  const { from, to, type, req } = args

  if (req.user?.collection !== 'managers') return { kind: 'none' }
  // The form posts the whole document, so every ordinary save re-posts the
  // stored status. A move to the value already held is not a move.
  if (from === undefined || to === undefined || to === from) return { kind: 'none' }

  if (!holdsCollectionPermission({ req, collection: 'user-submissions', operation: 'update' })) {
    return { kind: 'illegal', reason: 'You do not have permission to review submissions.' }
  }

  // One table holds four intakes sharing one status vocabulary, so without this
  // a contact row could be walked through the review states and reach the
  // accept path with no `proposed` to apply.
  if (type !== 'proposal') {
    return { kind: 'illegal', reason: `A ${type} submission is not reviewable.` }
  }

  const action = actionFor(from, to)
  if (!action) {
    return {
      kind: 'illegal',
      reason: `A ${STATUS_LABELS[from].toLowerCase()} submission cannot become ${STATUS_LABELS[to].toLowerCase()}.`,
    }
  }

  return { kind: 'decision', action }
}

/**
 * Record a decision, and for an accept write the event it approves.
 *
 * Nothing here writes `status`: the review's own update already did, which is
 * also why `submission` is the document that update wrote rather than a fresh
 * read — an edit the reviewer made in the same post is already in it.
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
      // Nothing reads the result, and `depth: 0` is what stops Payload paying
      // for it: at the config's default depth this row's afterRead populates
      // six relationships and recomputes both virtual review projections — a
      // second `mergeProposal` and a second whole-Events diff per decision.
      depth: 0,
      overrideAccess: true,
      // This write forwards the reviewing manager's `req`, so the review hook
      // would see it too. It moves no status, so `reviewMove` already answers
      // `none` — the flag is the belt, because a recursion here would create an
      // event per turn.
      context: { skipSubmissionReview: true, skipWriteGuard: true },
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
  // `guardStatusTransition` refuses the move to `accepted` without one, so this
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
