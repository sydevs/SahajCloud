/**
 * The submission workflow's vocabulary, in a leaf module.
 *
 * `screening` → the async ScreenEventSubmissions job is (or will be) checking
 * the submitter's email and resolving the region; `pending` → awaiting a
 * manager's decision; the rest are terminal and double as the outcome record:
 * `spam` (kept for abuse tracking, never notified), `created` (a new Event was
 * created — `event` points at it), `updated` (the proposal was applied to the
 * existing `event`), `rejected`.
 *
 * Separate from `EventSubmissions.ts` because the admin components need these
 * too, and that file imports `serverEnv`, every hook and the review endpoint —
 * importing it from a client component would pull all of that into the admin
 * bundle (the hazard `src/AGENTS.md` warns about for
 * barrels). This module imports nothing, so both sides can share one
 * definition instead of restating the union as string literals.
 */

export const SUBMISSION_STATUSES = [
  'screening',
  'pending',
  'spam',
  'created',
  'updated',
  'rejected',
] as const

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number]

/** Still actionable — Accept / Reject are offered. */
export const OPEN_SUBMISSION_STATUSES: readonly SubmissionStatus[] = ['screening', 'pending']

/**
 * Shelved without touching an event, so returning one to `pending` is safe.
 * Deliberately not `created` / `updated`: those already wrote to an event, and
 * reopening one would invite a second Accept that created a duplicate listing
 * or re-applied a patch a manager has since edited away.
 */
export const REOPENABLE_STATUSES: readonly SubmissionStatus[] = ['spam', 'rejected']

/**
 * What each status is *called*, everywhere a reviewer meets it: the list
 * column, the `status` select in the System drawer, and the heading of the
 * review banner (`EventSubmissionStatus`, which adds the sentence saying what
 * to do about it). One definition, because a row reading "Pending Review" that
 * opens onto a banner headed "Awaiting Review" makes a reader stop and wonder
 * whether they are two different things.
 */
export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  screening: 'Checking',
  pending: 'Awaiting Review',
  spam: 'Marked Spam',
  created: 'Event Created',
  updated: 'Event Updated',
  rejected: 'Rejected',
}
