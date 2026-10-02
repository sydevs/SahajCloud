import type { Payload } from 'payload'

import { runQueueAfterCommit } from '@/lib/jobs/runQueueAfterCommit'

/**
 * How long to wait before running the queue.
 *
 * Long enough for the caller's transaction to have committed, short enough that
 * nobody waits on it. The queue's own autoRun is what makes the exact number
 * uncritical — see `runQueueAfterCommit`.
 */
const QUEUE_RUN_DELAY_MS = 2000

/**
 * Run the `screening` queue a beat after the current transaction commits.
 *
 * A job row queued with `req` joins the caller's transaction, so a rolled-back
 * write never leaves an orphaned job — and the job cannot run until that
 * transaction commits. This is what runs it then, rather than leaving it to sit
 * until the next sweep. The delay is why this wrapper exists: both callers here
 * queue inside their own transaction.
 *
 * Both live in this intake's own pipeline: the create hook that queues
 * screening, and the `screenSubmission` task that queues delivery from inside
 * its own transaction. The legacy intakes state the same mechanism inline and
 * are deleted with their collections in Phase 3.
 */
export function runScreeningQueueAfterCommit(args: {
  payload: Payload
  /** Names the caller in the warning, so a failed run says which one. */
  label: string
  /** Whatever identifies the row, merged into the warning. */
  context?: Record<string, unknown>
}): void {
  runQueueAfterCommit({ ...args, queue: 'screening', delayMs: QUEUE_RUN_DELAY_MS })
}
