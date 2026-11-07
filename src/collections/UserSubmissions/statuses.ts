import type { UserSubmission } from '@/payload-types'

/**
 * The status vocabulary, in a leaf module.
 *
 * Separate from `fields.ts` because the admin review components need it too,
 * and that file pulls in `zod`, `@/fields` and every review hook — importing it
 * from a `'use client'` component would ship all of that to the browser (the
 * hazard `src/AGENTS.md` states for barrels). This module's only import is a
 * type, which is erased.
 */

/**
 * One six-state vocabulary for every type, replacing three per-collection sets.
 *
 * `pending` → nothing has decided yet. That covers both "screening is still
 * running" and "screening passed, a human has not looked" — the two are told
 * apart by whether `screeningResult` exists, not by a status of its own.
 *
 * `accepted` / `rejected` are terminal **human** decisions. `rejected` is a
 * manager's decline and nothing else.
 *
 * ⚠ `spam` is the machine's refusal, and it is a separate status precisely so
 * nothing has to re-derive who refused a row. Abuse counting selects it, and a
 * manager's decline is never a spam strike against the person who wrote in.
 * Which check refused stays in `screeningResult.verdict`, for the reader.
 *
 * `confirmed_spam` is an admin agreeing with the machine. It counts as a spam
 * strike for the same reason `spam` does, and it is a sixth status rather than
 * a flag because it is what takes a row off the admin's own open-items list:
 * that list selects `spam` alone, so confirming one — or releasing it back to
 * `pending` — is what settles it.
 *
 * `failed` is the retryable one, carried over from user-messages: the decision
 * went fine and the delivery did not. It is not terminal, and it is the state
 * nobody else would notice.
 */
export const SUBMISSION_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'spam',
  'confirmed_spam',
  'failed',
] as const

/**
 * What each status is called, in the list column, the `status` select and the
 * review banner alike. One definition, so a row and the document it opens never
 * disagree.
 */
export const STATUS_LABELS: Record<UserSubmission['status'], string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Rejected',
  spam: 'Spam',
  confirmed_spam: 'Confirmed spam',
  failed: 'Failed',
}

/**
 * Still actionable — Accept / Reject are offered.
 *
 * ⚠ `failed` belongs here. It means the decision path was fine and the review
 * email did not send, so a manager who reaches the row by another route must
 * still be able to act on it. `event-submissions`' own open set had no such
 * status, and porting it verbatim would have refused them.
 */
export const OPEN_REVIEW_STATUSES: readonly UserSubmission['status'][] = ['pending', 'failed']

/**
 * Refused as spam — the machine's call, and an admin agreeing with it.
 *
 * `as const` on purpose: the two members are offered different decisions, so
 * the button map keys on this union and a third member is a compile error
 * rather than a status nobody can settle.
 */
export const SPAM_REVIEW_STATUSES = [
  'spam',
  'confirmed_spam',
] as const satisfies readonly UserSubmission['status'][]

export type SpamReviewStatus = (typeof SPAM_REVIEW_STATUSES)[number]

/**
 * Shelved without touching an event, so returning one to `pending` is safe.
 * Deliberately not `accepted`: that already wrote to an event, and reopening it
 * would invite a second Accept that created a duplicate listing or re-applied a
 * patch a manager has since edited away.
 */
export const REOPENABLE_REVIEW_STATUSES: readonly UserSubmission['status'][] = ['rejected', 'spam']

/**
 * What each screening verdict is called where a reader meets it — the status
 * banner's "Refused by screening: …". The complete sentence is screening's own
 * note; this is the short form beside the heading.
 */
export const VERDICT_LABELS: Record<
  NonNullable<UserSubmission['screeningResult']>['verdict'],
  string
> = {
  ok: 'passed',
  blocked_sender: 'blocked sender',
  disposable_email: 'disposable email address',
  invalid_email: 'invalid email address',
  no_mx_records: 'email domain accepts no mail',
  repeat_sender: 'repeatedly refused sender',
  duplicate_body: 'duplicate message',
  content_rejected: 'content refused',
}
