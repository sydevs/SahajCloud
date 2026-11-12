import { can, type Move, type StateMachine, targetsFor } from '@/lib/stateMachine/machine'
import type { UserSubmission } from '@/payload-types'

import {
  isSpamStatus,
  OPEN_REVIEW_STATUSES,
  REOPENABLE_REVIEW_STATUSES,
  SUBMISSION_STATUSES,
} from './statuses'

type Status = UserSubmission['status']

/**
 * Every writer that may move a submission's status.
 *
 * `review` and `admin` are the two human ones, and `reviewMove` owns what each
 * may do and why — this table states the same moves so the buttons can be built
 * from one source (`tests/int/user-submissions-review-lifecycle.int.spec.ts`
 * pins the two together, in both directions).
 *
 * The four below them are the system writers the review predicate deliberately
 * exempts, because they carry no manager: before #1121 that exemption was the
 * whole of their gate, so each could write any status from anywhere.
 */
export const SUBMISSION_ACTORS = [
  'admin',
  'block',
  'delivery',
  'repeat-signup',
  'review',
  'screening',
] as const

export type SubmissionActor = (typeof SUBMISSION_ACTORS)[number]

/** An admin is a reviewer too, so every reviewer move is also theirs. */
const REVIEWERS = ['review', 'admin'] as const

const REVIEW_MOVES: Move<Status, SubmissionActor>[] = [
  { from: OPEN_REVIEW_STATUSES, to: 'accepted', by: REVIEWERS },
  { from: OPEN_REVIEW_STATUSES, to: 'rejected', by: REVIEWERS },
  { from: REOPENABLE_REVIEW_STATUSES, to: 'pending', by: REVIEWERS },
]

/**
 * The submission lifecycle, as the moves that exist.
 *
 * ⚠ **`screening` and `block` write the same move for different reasons**, and
 * both stay named: an actor is who made the move, and collapsing the two would
 * make a refusal unattributable.
 */
export const SUBMISSION_MACHINE: StateMachine<Status, SubmissionActor> = {
  name: 'submission status',
  field: 'status',
  moves: [
    ...REVIEW_MOVES,

    // Settling the machine's refusal: confirming it, or withdrawing it on an
    // intake nobody reviews. Map-wide consequences, so an admin's alone.
    { from: ['spam'], to: 'confirmed_spam', by: ['admin'] },
    { from: ['confirmed_spam'], to: 'pending', by: ['admin'] },
    // Sending a failed delivery again (#1120 decision 2).
    { from: ['failed'], to: 'pending', by: ['admin'] },

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
  ],
}

/** Statuses a reviewer is offered `to` from — what a button map is built from. */
export function reviewableFrom(actor: SubmissionActor, to: Status): Status[] {
  return SUBMISSION_STATUSES.filter((status) =>
    targetsFor(SUBMISSION_MACHINE, status, actor).includes(to),
  )
}

/**
 * Where an admin may send a delivery again: `failed`, and nothing else.
 *
 * Derived rather than spelled, so the button and the guard cannot disagree. It
 * is the move to `pending` that is an admin's alone and is not a spam
 * withdrawal — a reviewer's own Reopen reaches `pending` too, from the statuses
 * nothing was ever sent for.
 */
export const RESEND_FROM: Status[] = SUBMISSION_STATUSES.filter(
  (status) =>
    !isSpamStatus(status) &&
    can(SUBMISSION_MACHINE, status, 'pending', 'admin') &&
    !can(SUBMISSION_MACHINE, status, 'pending', 'review'),
)
