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
