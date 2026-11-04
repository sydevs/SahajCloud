import type { Where } from 'payload'

import type { UserSubmission } from '@/payload-types'

/**
 * Whether a registration row still counts — for a reminder, for a follow-up,
 * and for an event's fullness.
 *
 * A registration refused by screening is **flagged, not deleted**: the row
 * stands and so does any email already sent, because no job ever recalls an
 * email and a manager needs the evidence to unwind a false positive. What
 * `spam` buys is exactly this exclusion — the registrant stops receiving
 * reminders, and they stop occupying a seat. `rejected`, a manager declining
 * one by hand, does the same.
 *
 * `failed` is excluded too, and for a different reason: it means the row's own
 * delivery never happened, so the person has never been told they are
 * registered. Reminding them about an event they do not know they signed up for
 * is worse than silence.
 *
 * ⚠ **Its consumers arrive in Phase 3.** `SendSessionReminders`,
 * `SendPostEventFollowUps` and the fullness count still query the
 * `registrations` collection, which this replaces; they re-point at
 * `user-submissions` when that collection is deleted. This pair exists now so
 * the rule has one definition when they do, rather than three re-derivations.
 */
export function isActiveRegistration(submission: {
  type?: UserSubmission['type'] | null
  status?: UserSubmission['status'] | null
}): boolean {
  return (
    submission.type === 'registration' &&
    submission.status != null &&
    !INACTIVE_STATUSES.includes(submission.status)
  )
}

const INACTIVE_STATUSES: readonly UserSubmission['status'][] = ['rejected', 'spam', 'failed']

/**
 * The same rule as SQL, for a query that must select on it.
 *
 * One rule, two expressions — kept in one file so they cannot drift, and pinned
 * against each other by `tests/unit/registration-active.spec.ts`. `status` is
 * indexed, so this stays a cheap predicate.
 */
export const activeRegistrationWhere: Where = {
  type: { equals: 'registration' },
  status: { not_in: [...INACTIVE_STATUSES] },
}
