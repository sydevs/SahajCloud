import type { Payload } from 'payload'

import { runQueueAfterCommit } from '@/lib/jobs/runQueueAfterCommit'

/**
 * Run the `screening` queue a beat after the current transaction commits.
 *
 * The contract — the queued row joining the caller's transaction, the
 * best-effort run, the autoRun net, the suppression under test — lives in
 * `runQueueAfterCommit`. This names the queue, for the two callers in this
 * intake's own pipeline: the create hook that queues screening, and the
 * `screenSubmission` task that queues delivery from inside its own transaction.
 */
export function runScreeningQueueAfterCommit(args: {
  payload: Payload
  label: string
  context?: Record<string, unknown>
}): void {
  runQueueAfterCommit({ ...args, queue: 'screening' })
}
