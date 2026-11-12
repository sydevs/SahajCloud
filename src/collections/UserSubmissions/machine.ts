import { ANY_STATE, can, type Move, type StateMachine } from '@/lib/stateMachine/machine'
import type { UserSubmission } from '@/payload-types'

import { OPEN_REVIEW_STATUSES, REOPENABLE_REVIEW_STATUSES, SUBMISSION_STATUSES } from './statuses'

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
  'import',
  'repeat-signup',
  'review',
  'screening',
] as const

export type SubmissionActor = (typeof SUBMISSION_ACTORS)[number]

/** An admin is a reviewer too, so every reviewer move is also theirs. */
const REVIEWERS = ['review', 'admin'] as const

/**
 * The actors a write may **name** — everything but the two human ones.
 *
 * ⚠ A write that could claim to be `review` or `admin` would be a way past
 * `reviewMove`'s grant check, since `req.context` is written by whatever code
 * made the call. Who the person is comes from the request, never from a claim.
 */
export const SUBMISSION_SYSTEM_ACTORS: readonly SubmissionActor[] = SUBMISSION_ACTORS.filter(
  (actor) => !(REVIEWERS as readonly string[]).includes(actor),
)

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

    // A seed importer mirrors a system of record — the legacy Atlas's own rows,
    // or a preview's fixture — so the file decides the status, as it does for
    // an event's stage. Nothing but a seed may name this actor.
    ...SUBMISSION_STATUSES.map((status) => ({
      from: ANY_STATE,
      to: status,
      by: ['import'] as const,
    })),
  ],
}

/** Statuses a reviewer is offered `to` from — what a button map is built from. */
export function reviewableFrom(actor: SubmissionActor, to: Status): Status[] {
  return SUBMISSION_STATUSES.filter((status) => can(SUBMISSION_MACHINE, status, to, actor))
}

/**
 * Where an admin may send a delivery again.
 *
 * ⚠ **Named, not derived.** Deriving it from "an admin may reach `pending` and
 * a reviewer may not" happens to answer `failed` today, and would silently
 * widen the day another admin-only move to `pending` is added — putting a
 * "Send again" button on rows nothing was ever sent for. It is one state, and
 * it is the `from` of the move three lines above.
 */
export const RESEND_FROM: readonly Status[] = ['failed']
