import type { Where } from 'payload'

import type { UserSubmission } from '@/payload-types'

/**
 * How long a **delivered contact message** is kept. Short on purpose: the row
 * persists only so screening has history to compare against.
 *
 * ⚠ **Lower bound**: must stay comfortably above `HISTORY_WINDOW_HOURS`, or
 * sender history counts against deleted rows and silently passes everything.
 * `tests/unit/submission-retention.spec.ts` pins it.
 */
export const CONTACT_ACCEPTED_DAYS = 7

/**
 * How long a **machine-refused** (`spam`) row is kept, whatever its type.
 * Longer, because a sender's history is the evidence a pattern is visible in.
 * Bounded, because abuse tracking has a shelf life.
 */
export const MACHINE_SPAM_DAYS = 90

/** How long a proposal is kept once a manager has decided it, either way. */
export const PROPOSAL_DAYS = 30

/**
 * The types kept forever: a **registration** is an attendance record, a
 * **subscribe** row is a consent record.
 *
 * One list, two answers — no window below may select these types, and a row of
 * one of them **pins** its `users` row against the orphan sweep.
 *
 * ⚠ `failed` is deliberately in no window: it means we accepted a submission,
 * told nobody, and delivered nothing. It stays until a manager resolves it.
 */
export const DURABLE_TYPES: readonly UserSubmission['type'][] = ['registration', 'subscribe']

/** One sweep: what to delete, and what to call it in the log. */
export interface PurgeWindow {
  name: string
  days: number
  where: (cutoff: string) => Where
}

/**
 * The sweeps, in the order they run. **Machine-spam first**, which makes the
 * windows disjoint by construction rather than by reading two `status` clauses
 * together.
 *
 * ⚠ **A machine refusal is `spam` and a manager's decline is `rejected`**, so
 * each reaches exactly one window. That separation is what lets a declined
 * proposal go at 30 days with the rest of its type, rather than waiting out the
 * spam window because nothing cheap could tell the two refusals apart.
 */
export const PURGE_WINDOWS: PurgeWindow[] = [
  {
    name: 'machineSpam',
    days: MACHINE_SPAM_DAYS,
    where: (cutoff) => ({
      // The one window naming no type otherwise, so it is the one that has to
      // say which types it does not reach.
      type: { not_in: [...DURABLE_TYPES] },
      status: { equals: 'spam' },
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
      status: { in: ['accepted', 'rejected'] },
      createdAt: { less_than: cutoff },
    }),
  },
]
