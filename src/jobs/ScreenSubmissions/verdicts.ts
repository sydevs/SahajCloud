import { z } from 'zod'

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
 * ⚠ **The column's `jsonSchema` cannot answer this, and that is why the check
 * exists.** It compiles an Ajv validator that runs on **write**, and it
 * generates the type above — but nothing re-validates on **read**, so a value
 * that came back out of Postgres is `unknown` to Payload and to the compiler
 * alike. A row written before the column had its present shape, or by any path
 * that did not go through Payload, is exactly what this guards against.
 *
 * So the read side asserts in Zod, over `verdict` alone — the one key anything
 * reads back, and the one whose value decides whether the row counts as abuse.
 * The rest of the shape is the column's own schema's job; restating it here
 * would be a second definition of it, drifting the day the column changes.
 */
const screeningResultGuard = z.object({ verdict: z.enum(SUBMISSION_VERDICTS) })

export function isScreeningResult(value: unknown): value is SubmissionScreeningResult {
  return screeningResultGuard.safeParse(value).success
}

/**
 * Whether **the machine** refused this row.
 *
 * ⚠ **`spam` and `rejected` are two statuses so this can be one comparison.**
 * `rejected` is a manager's decline; counting it as abuse would make a
 * manager's judgement a spam strike against the person who wrote in, and enough
 * of those would refuse their next genuine submission. A row still `pending`
 * has not been screened, and is not a strike either.
 *
 * `status` is indexed, so unlike the verdict this is a predicate a query can
 * reach — which is why `PurgeSubmissions` spells the same status in SQL rather
 * than importing this. The generated union is what keeps the two honest.
 */
export function isMachineSpam(submission: { status?: UserSubmission['status'] | null }): boolean {
  return submission.status === 'spam'
}
