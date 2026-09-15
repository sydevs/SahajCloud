import { SUBMISSION_VERDICTS } from '@/collections/UserSubmissions/fields'
import type { UserSubmission } from '@/payload-types'

/**
 * The verdict union, read back off the generated type rather than restated —
 * `SUBMISSION_VERDICTS` is what generates it (`src/types/AGENTS.md`).
 */
export type SubmissionVerdict = NonNullable<UserSubmission['screeningResult']>['verdict']

/** The stored shape, likewise generated from the column's own `jsonSchema`. */
export type SubmissionScreeningResult = NonNullable<UserSubmission['screeningResult']>

/**
 * What an admin is told, per verdict.
 *
 * **Type-neutral on purpose**, which is the thing that made the two jobs being
 * replaced un-shareable: event-submissions' note ended "…and check this event
 * is real", meaningless for a message somebody sent us, and user-messages' was
 * written about a message. One intake means one vocabulary, so a note says what
 * the *check* found and leaves what follows to the reader — who can see the
 * row's type.
 *
 * `ok` carries none: an accepted submission needs no explanation.
 */
export const VERDICT_NOTES: Record<SubmissionVerdict, string | null> = {
  ok: null,
  disposable_email:
    'The sender used a disposable-email domain. Treat any address here as unreachable.',
  invalid_email: 'The sender’s address is not a usable email address.',
  no_mx_records:
    'The sender’s domain publishes no mail servers, so nothing can ever be delivered to it.',
  repeat_sender:
    'This sender has been refused repeatedly in the last day. Their earlier submissions are on record.',
  duplicate_body: 'This sender has already sent this exact text inside the last day.',
  content_rejected: 'The submitted content was refused by the content checks.',
}

/**
 * Whether a stored verdict is one this build wrote.
 *
 * The column is JSON, so a bad write could have left anything there — and this
 * function **asserts a type**, so it checks the verdict against the real set
 * rather than merely for being a string. An assertion that accepts values
 * outside the union is a lie the compiler then propagates everywhere.
 */
export function isScreeningResult(value: unknown): value is SubmissionScreeningResult {
  if (typeof value !== 'object' || value === null) return false
  // Read as `unknown` rather than through a cast: casting to the result type
  // first would hand `includes` an already-narrowed value, and let TypeScript
  // agree with an assumption nothing has checked yet.
  const { verdict } = value as { verdict?: unknown }
  return typeof verdict === 'string' && (SUBMISSION_VERDICTS as readonly string[]).includes(verdict)
}

/**
 * Whether **the machine** refused this row.
 *
 * ⚠ **The one rule that must never be re-derived from `status`.** The four
 * shared statuses fold a spam verdict and a human decline into one `rejected`,
 * which is what lets every type share a vocabulary — so a manager declining a
 * proposal reads as `rejected` exactly like a bot-sent message does. Counting
 * abuse off `status` would make a manager's judgement a spam strike against the
 * person who wrote in, and enough of those would refuse their next genuine
 * submission.
 *
 * A row with no verdict has not been screened yet, and is not a strike either.
 */
export function isMachineSpam(submission: {
  screeningResult?: unknown
}): boolean {
  const result = submission.screeningResult
  return isScreeningResult(result) && result.verdict !== 'ok'
}
