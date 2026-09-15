import type { Where } from 'payload'

import type { UserSubmission } from '@/payload-types'

import { HISTORY_WINDOW_HOURS } from '../ScreenSubmissions/senderHistory'

/**
 * How long a **delivered contact message** is kept.
 *
 * Short on purpose: the intake this replaces stored nothing at all, and
 * persisting was accepted only because screening needs history to compare
 * against. A week keeps that promise as nearly as a persisted intake can — the
 * email has gone out, a manager has had time to see the row, and the screening
 * window is long since satisfied.
 *
 * ⚠ **Lower bound**: this must stay comfortably above `HISTORY_WINDOW_HOURS`,
 * or the sender-history check would be counting against rows already deleted —
 * it would silently pass everything, with no error anywhere.
 * `tests/unit/submission-retention.spec.ts` pins the relationship.
 */
export const CONTACT_ACCEPTED_DAYS = 7

/**
 * How long a **machine-refused** row is kept, whatever its type.
 *
 * Longer, because it is evidence: a sender's history is what makes a pattern
 * visible, and the verdict that made it evidence is the machine's, never a
 * manager's. Not forever, though — abuse tracking has a shelf life, and
 * bounding it is the entire point of having a retention policy.
 */
export const MACHINE_SPAM_DAYS = 90

/** How long a proposal is kept once it has been decided. */
export const PROPOSAL_DAYS = 30

/**
 * The types that are **kept forever**, whatever state they reach:
 *
 * - a **registration** is an attendance record, and an event's history is what
 *   a manager plans the next one from;
 * - a **subscribe** row is a **consent record**. It is the evidence that a
 *   person asked to be on a list, and deleting it would leave us holding the
 *   subscription with nothing to show for it.
 *
 * That one fact answers two questions, which is why there is one list. No
 * window below may select these types — the spam sweep names them in a
 * `not_in` — and a row of one of them **pins** its `users` row against the
 * orphan sweep, because deleting the person it names would leave an attendance
 * record and a consent record pointing at nobody.
 *
 * ⚠ It was a table nothing read until #791's review. Stated as a policy beside
 * a sweep that contradicted it, "kept forever" was untested and untrue: the
 * spam window named no `type`, so a `rejected` registration went at 90 days.
 * A statement of policy that nothing enforces is worse than none.
 *
 * ⚠ `failed` is deliberately absent from every window below, for a different
 * reason. It means we accepted a submission, told the person nothing, and never
 * delivered it — the one state where deleting the row destroys the only record
 * that anything went wrong. It stays until a manager resolves it.
 */
export const DURABLE_TYPES: readonly UserSubmission['type'][] = ['registration', 'subscribe']

/** One sweep: what to delete, and what to call it in the log. */
export interface PurgeWindow {
  name: string
  days: number
  where: (cutoff: string) => Where
}

/**
 * The sweeps, in the order they run.
 *
 * **Machine-spam first**, and the order matters: a refused contact row would
 * otherwise match the 7-day accepted window's `type` clause on its way past —
 * it does not, because that window names `status: accepted` — but running the
 * longer window first makes the two provably disjoint by construction rather
 * than by reading both clauses together.
 *
 * ⚠ **Every window reads `status`, and that is not the contradiction it looks
 * like.** Abuse *counting* must read `screeningResult.verdict`, because a
 * manager's decline shares the `rejected` status. Retention is the opposite
 * question — "has anyone finished with this row" — and what the
 * `screeningResult` rule protects is a sender's record, not a row's lifespan.
 *
 * ⚠ **So a declined proposal is kept 90 days, not 30**, and that is the price
 * of the paragraph above rather than an oversight. `proposals` takes
 * `accepted`; a decline is `rejected`, which only `machineSpam` selects. The
 * sweep cannot separate the two, because the verdict that would separate them
 * lives in a JSON column nothing can `where` on cheaply
 * (`src/collections/AGENTS.md`). Erring long keeps the evidence a machine
 * refusal is; erring short would delete it. An earlier draft of this comment
 * claimed the 30 days the code never gave.
 */
export const PURGE_WINDOWS: PurgeWindow[] = [
  {
    name: 'machineSpam',
    days: MACHINE_SPAM_DAYS,
    where: (cutoff) => ({
      // The one window that names no type otherwise, so it is the one that has
      // to say which types it does not reach. Without this, "kept forever"
      // lasted ninety days.
      type: { not_in: [...DURABLE_TYPES] },
      status: { equals: 'rejected' },
      createdAt: { less_than: cutoff },
    }),
  },
  {
    name: 'contactAccepted',
    days: CONTACT_ACCEPTED_DAYS,
    where: (cutoff) => ({
      type: { equals: 'contact' },
      status: { equals: 'accepted' },
      createdAt: { less_than: cutoff },
    }),
  },
  {
    name: 'proposals',
    days: PROPOSAL_DAYS,
    where: (cutoff) => ({
      type: { equals: 'proposal' },
      status: { in: ['accepted'] },
      createdAt: { less_than: cutoff },
    }),
  },
]

/** Re-exported so the lower bound above is pinnable from one import. */
export { HISTORY_WINDOW_HOURS }
