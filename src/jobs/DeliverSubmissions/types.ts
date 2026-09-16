import type { PayloadRequest } from 'payload'

import type { UserSubmission } from '@/payload-types'

/**
 * What one delivery attempt produced.
 *
 * `retryable` is what the task branches on, and it is the whole reason this is
 * a union rather than a thrown error: a refused provider credential and a
 * timed-out SMTP connection are both "it did not arrive", but only one of them
 * will be different next time. Retrying the first costs three more attempts to
 * reach the same answer, and buries the real cause under two identical log
 * lines.
 *
 * ⚠ **This is not a second email system, and nothing here re-implements
 * `payload.sendEmail`.** Every email a delivery sends goes out through it —
 * `sendUserMessage.ts:52`, `sendSubmissionReview.ts:31`,
 * `sendRegistrationConfirmation.ts:80`, `sendRegistrationNotification.ts:55` —
 * rendered and branded by `@/plugins/email`. This union is the layer *above*
 * the transport, which Payload's email support does not reach:
 *
 * - **Not every delivery is an email.** A `subscribe` row is an HTTP call to a
 *   mailing-list provider (`@/lib/mailingList/subscribe.ts:35`), with no
 *   message and no `sendEmail` to route through.
 * - **`sendEmail` reports nothing back.** Its adapter contract returns
 *   `Promise<TSendEmailResponse>` with `unknown` as the app's instantiation
 *   (`payload/dist/email/types.d.ts`, `EmailAdapter`), and this app's
 *   production adapter deliberately never throws — `resendAdapter` returns
 *   normally on a dropped message (`@/plugins/email/resendAdapter.ts:93`, `:119`,
 *   `:135`) so a failed verification email cannot roll back a manager create
 *   (`docs/rules/email.md`). Whether it arrived is therefore the caller's
 *   question to answer, and `ok` is that answer.
 * - **Payload has no retry policy for mail.** The job queue has one
 *   (`TaskConfig.retries`), and `retryable` is the only thing that tells a
 *   permanent refusal — no address, no list configured, a deleted event — from
 *   a transient one, so the first spends no attempts and the second spends all
 *   of them.
 * - **`sentTo` and `detail` become an `activityLog` entry per attempt**, a
 *   document-level record no mail transport keeps.
 */
export type DeliveryOutcome =
  | {
      ok: true
      /** Where it went, as one line for the activity log. */
      sentTo: string
      /** What the receiving end called the result, when it named one. */
      detail?: string
    }
  | { ok: false; detail: string; retryable: boolean }

/** What every per-type delivery is handed. */
export interface DeliveryContext {
  req: PayloadRequest
  submission: UserSubmission
}

/**
 * One submission type's delivery, and the only shape the job knows about.
 *
 * Every implementation obeys the same two rules, which is what lets the task
 * treat all four identically: **it throws nothing**, and it decides for itself
 * whether a failure is worth another attempt. A deliverer that threw would skip
 * the `activityLog` entry and the `failed` status, and spend all three retries
 * on a refusal that cannot change.
 */
export type SubmissionDeliverer = (context: DeliveryContext) => Promise<DeliveryOutcome>

/**
 * The delivery table: one entry per submission type, and the one place a new
 * type is wired in.
 *
 * **The key type is read back off the generated `UserSubmission['type']` union
 * rather than restated**, which is the point of the alias. `SUBMISSION_TYPES`
 * (`@/collections/UserSubmissions/fields.ts`) generates that column, so adding
 * an option there and regenerating types makes a `DeliveryRegistry` missing its
 * entry a **compile error** — the new type cannot reach production with no way
 * to deliver it. It is the same shape, for the same reason, as `TYPE_LABELS`
 * and `TYPE_SUBMISSION_KEYS` beside it.
 */
export type DeliveryRegistry = Record<UserSubmission['type'], SubmissionDeliverer>
