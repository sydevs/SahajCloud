import type { Where } from 'payload'

import type { UserSubmission } from '@/payload-types'

import { HISTORY_WINDOW_HOURS } from '../ScreenSubmissions/senderHistory'

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
 * How long a **machine-refused** row is kept, whatever its type. Longer,
 * because a sender's history is the evidence a pattern is visible in. Bounded,
 * because abuse tracking has a shelf life.
 */
export const MACHINE_SPAM_DAYS = 90

/** How long a proposal is kept once it has been decided. */
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
 * ⚠ **Every window reads `status`, where abuse counting must read
 * `screeningResult.verdict`** — retention asks "has anyone finished with this
 * row", which is a different question from whose refusal it was.
 *
 * ⚠ **So a declined proposal is kept 90 days, not 30.** A decline is
 * `rejected`, which only `machineSpam` selects, and the verdict separating it
 * from a machine refusal lives in a JSON column nothing can `where` on cheaply
 * (`src/collections/AGENTS.md`). Erring long keeps the evidence; erring short
 * deletes it.
 */
export const PURGE_WINDOWS: PurgeWindow[] = [
  {
    name: 'machineSpam',
    days: MACHINE_SPAM_DAYS,
    where: (cutoff) => ({
      // The one window naming no type otherwise, so it is the one that has to
      // say which types it does not reach.
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
