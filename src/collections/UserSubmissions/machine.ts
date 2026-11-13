import {
  ANY_STATE,
  can,
  defineStateMachine,
  type Move,
  type MoveContext,
  type Refusal,
  startsOf,
} from '@/lib/stateMachine/machine'
import { relationId } from '@/lib/utilities/relationId'
import type { UserSubmission } from '@/payload-types'
import { isAdminManager } from '@/plugins/access/adminOnly'
import { holdsCollectionPermission } from '@/plugins/access/permissions'

import { submissionRegionId } from './lifecycle/mergeProposal'
import {
  OPEN_REVIEW_STATUSES,
  REOPENABLE_REVIEW_STATUSES,
  STATUS_LABELS,
  SUBMISSION_STATUSES,
} from './statuses'

type Status = UserSubmission['status']

/**
 * Every writer that may move a submission's status.
 *
 * `review` and `admin` are the two people: a manager holding the
 * `user-submissions: update` grant, and an admin, who is a reviewer too. The
 * rest are system writers with no person behind them.
 */
export const SUBMISSION_ACTORS = [
  'admin',
  'block',
  'delivery',
  'import',
  'repeat-signup',
  'review',
  'screening',
] as const

export type SubmissionActor = (typeof SUBMISSION_ACTORS)[number]

/** The decisions a person's move is, and what `applyReview` then does. */
export type ReviewAction = 'accept' | 'confirm-spam' | 'reject' | 'reopen' | 'resend'

const REVIEWERS = ['review', 'admin'] as const satisfies readonly SubmissionActor[]

/**
 * Why a new-event accept cannot proceed. One wording, raised on `region` by the
 * accept's own condition and as the narrowing in `applyReview` — a reviewer
 * fixes it in the field the message names.
 */
export const NO_REGION_MESSAGE =
  'This submission has no resolved city/venue yet — set the Region field (or wait for screening) before accepting.'

type Ctx = MoveContext<UserSubmission>

/**
 * One table holds four intakes sharing one status vocabulary, and only a
 * proposal has a review path: without this, a contact row could be walked
 * through the review states and reach the accept path with no `proposed` to
 * apply.
 */
const reviewable = ({ doc }: Ctx): true | Refusal =>
  doc.type === 'proposal' || `A ${doc.type} submission is not reviewable.`

/**
 * An accept writes the event it approves, which must sit in a city or venue.
 *
 * ⚠ **The document as written, so an explicit `null` counts.** The form posts
 * every field, so a reviewer who clears Region posts `region: null`; reading
 * the stored value instead would pass a row whose written region is empty.
 */
const acceptable = (ctx: Ctx): true | Refusal => {
  const proposal = reviewable(ctx)
  if (proposal !== true) return proposal
  const { doc } = ctx
  if (relationId(doc.event) == null && submissionRegionId(doc) == null) {
    return { field: 'region', message: NO_REGION_MESSAGE }
  }
  return true
}

const ADMIN_SETTLES_SPAM = 'Only an admin can settle a spam refusal.'

/**
 * What a person may do, with the decision each move is.
 *
 * ⚠ **Settling a spam refusal is an admin's on every intake**; reopening a
 * refused *proposal* stays a reviewer's call, because narrowing it would take a
 * reviewer's own false-positive recovery away. Withdrawing a confirmed strike
 * is an admin's on every intake too.
 */
const REVIEW_MOVES: (Move<Status, SubmissionActor, UserSubmission> & { name: ReviewAction })[] = [
  { name: 'accept', from: OPEN_REVIEW_STATUSES, to: 'accepted', by: REVIEWERS, when: acceptable },
  { name: 'reject', from: OPEN_REVIEW_STATUSES, to: 'rejected', by: REVIEWERS, when: reviewable },
  {
    name: 'reopen',
    from: REOPENABLE_REVIEW_STATUSES,
    to: 'pending',
    by: REVIEWERS,
    when: reviewable,
  },

  // Settling the machine's refusal. Map-wide consequences — the strike it
  // confirms, the seat a released registration takes back — so an admin's alone.
  {
    name: 'confirm-spam',
    from: ['spam'],
    to: 'confirmed_spam',
    by: ['admin'],
    refusal: ADMIN_SETTLES_SPAM,
  },
  {
    name: 'reopen',
    from: ['confirmed_spam'],
    to: 'pending',
    by: ['admin'],
    refusal: ADMIN_SETTLES_SPAM,
  },
  // On a proposal the reviewers' own Reopen above answers first, which is the
  // same decision.
  { name: 'reopen', from: ['spam'], to: 'pending', by: ['admin'], refusal: ADMIN_SETTLES_SPAM },

  // Sending a failed delivery again (#1120 decision 2). `failed` means the
  // decision was fine and the email was not, so there is nothing to review —
  // but a resend can mail a visitor, so it is an admin's. A failed *proposal*
  // is still open for review instead.
  {
    name: 'resend',
    from: ['failed'],
    to: 'pending',
    by: ['admin'],
    when: ({ doc }) =>
      doc.type !== 'proposal' || 'A failed proposal is still open for review: accept or reject it.',
    refusal: 'Only an admin can send a failed delivery again.',
  },
]

/**
 * The submission lifecycle: every move, who may make it, and on which rows.
 *
 * ⚠ **`screening` and `block` write the same move for different reasons**, and
 * both stay named: an actor is who made the move, and collapsing the two would
 * make a refusal unattributable.
 */
export const SUBMISSION_MACHINE = defineStateMachine<Status, SubmissionActor, UserSubmission>({
  name: 'submission status',
  field: 'status',
  states: SUBMISSION_STATUSES,
  /**
   * ⚠ **Everything but the two people.** A write that could claim to be
   * `review` or `admin` would be a way past the grant check below, since
   * `req.context` is written by whatever code made the call.
   */
  declarable: SUBMISSION_ACTORS.filter(
    (actor) => !(REVIEWERS as readonly SubmissionActor[]).includes(actor),
  ),
  /**
   * ⚠ **A reviewer is a manager holding the `update` grant, not merely a
   * manager named on the row.** The collection's own `update` is wider: when
   * the role grants deny, `createAccessConfig` falls back to document-level
   * manager access, so whoever a submission's `manager` field names may edit
   * that row with no grant at all (`accessConfigs.ts`). Reading the
   * collection's `update` here would make being assigned a proposal authority
   * to publish the Events row accepting it writes. `holdsCollectionPermission`
   * is the grant alone.
   *
   * A request carrying no manager is nobody's: screening, delivery, the block
   * endpoint and the repeat-signup fold each name themselves instead.
   */
  person: (req) => {
    if (req.user?.collection !== 'managers') return null
    if (!holdsCollectionPermission({ req, collection: 'user-submissions', operation: 'update' })) {
      return { refused: 'You do not have permission to review submissions.' }
    }
    return isAdminManager(req.user) ? 'admin' : 'review'
  },
  refusal: ({ from, to }) =>
    `A ${STATUS_LABELS[from].toLowerCase()} submission cannot become ${STATUS_LABELS[to].toLowerCase()}.`,
  // Every intake opens here: a public form's write, a registration's repeat
  // opt-in, and whatever an admin creates by hand.
  opensAt: 'pending',
  opens: [
    // The fixture decides, as it does for an event's stage — an historical
    // registration was confirmed when it happened.
    ...SUBMISSION_STATUSES.map((status) => ({ at: status, by: ['import'] as const })),
  ],
  moves: [
    ...REVIEW_MOVES,

    { from: ['pending'], to: 'spam', by: ['screening'] },
    { from: ['pending'], to: 'spam', by: ['block'] },

    // Delivery writes the outcome of its own send, and re-queues a row it
    // could not finish.
    { from: ['pending', 'failed'], to: 'accepted', by: ['delivery'] },
    { from: ['pending', 'failed'], to: 'failed', by: ['delivery'] },
    { from: ['pending', 'failed'], to: 'pending', by: ['delivery'] },

    // A second sign-up from the same person folds into the row that exists,
    // which re-opens it whatever it had settled on.
    { from: ['accepted', 'pending', 'failed'], to: 'pending', by: ['repeat-signup'] },

    // A seed importer mirrors a system of record — the legacy Atlas's own rows,
    // or a preview's fixture — so the file decides the status, as it does for
    // an event's stage. Nothing but a seed may name this actor.
    ...SUBMISSION_STATUSES.map((status) => ({
      from: ANY_STATE,
      to: status,
      by: ['import'] as const,
    })),
  ],
})

/** Statuses a reviewer is offered `to` from — what a button map is built from. */
export function reviewableFrom(actor: SubmissionActor, to: Status): Status[] {
  return SUBMISSION_STATUSES.filter((status) => can(SUBMISSION_MACHINE, status, to, actor))
}

/** Where an admin may send a delivery again: the `resend` move's own starts. */
export const RESEND_FROM: readonly Status[] = startsOf(SUBMISSION_MACHINE, 'resend')
