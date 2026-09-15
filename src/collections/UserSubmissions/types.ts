import type { UserSubmission } from '@/payload-types'

/**
 * The unified intake's vocabulary, in a leaf module.
 *
 * It imports nothing but generated types, so the admin components that render a
 * submission's status share these definitions with the collection config and
 * the (Phase 2) jobs, rather than restating the unions as string literals.
 * Importing `UserSubmissions/fields.ts` from a client component would pull the
 * hooks — and everything they import — into the admin bundle.
 *
 * ⚠ **The two unions are derived, never restated** (`src/types/AGENTS.md`).
 * The const arrays below are the runtime values `fields.ts` builds the selects
 * from, so the column is generated *from* them — and deriving the types back
 * off `@/payload-types` closes that loop: adding an option without giving it a
 * label, or a `TYPE_SUBMISSION_KEYS` entry, is then a compile error rather than
 * an `undefined` at runtime.
 */

/**
 * What a submission *is*. Every access rule, policy branch and retention window
 * keys on this.
 *
 * `contact` and `subscribe` come from an authored `forms` document.
 * `registration` and `proposal` name an `event` instead — nobody authors a form
 * for them.
 */
export const SUBMISSION_TYPES = ['contact', 'subscribe', 'registration', 'proposal'] as const

export type SubmissionType = UserSubmission['type']

/** The types that must carry a `form`. The other two carry an `event`. */
export const FORM_BACKED_TYPES: readonly SubmissionType[] = ['contact', 'subscribe']

/**
 * One four-state vocabulary for every type, replacing three per-collection sets.
 *
 * `pending` → nothing has decided yet. That covers both "screening is still
 * running" and "screening passed, a human has not looked" — the two are told
 * apart by whether `screeningResult` exists, not by a fifth status.
 *
 * `accepted` / `rejected` are terminal decisions, whoever made them. A machine
 * spam verdict and a human decline both land on `rejected`; which it was stays
 * queryable in `screeningResult`, so abuse counting can read the machine
 * verdict without counting a manager's judgement as a spam strike.
 *
 * `failed` is the retryable one, carried over from user-messages: the decision
 * went fine and the delivery did not. It is not terminal, and it is the state
 * nobody else would notice.
 */
export const SUBMISSION_STATUSES = ['pending', 'accepted', 'rejected', 'failed'] as const

export type SubmissionStatus = UserSubmission['status']

/** What each type is called wherever an admin meets it. */
export const TYPE_LABELS: Record<SubmissionType, string> = {
  contact: 'Contact Message',
  subscribe: 'Subscription',
  registration: 'Registration',
  proposal: 'Event Proposal',
}

/**
 * What each status is called, in the list column and the `status` select alike.
 * One definition, so a row and the document it opens never disagree.
 */
export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  failed: 'Failed',
}
