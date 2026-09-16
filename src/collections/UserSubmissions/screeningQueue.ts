import type { Payload } from 'payload'

/**
 * How long to wait before running the queue.
 *
 * Long enough for the caller's transaction to have committed, short enough that
 * nobody waits on it. The queue's own autoRun is what makes the exact number
 * uncritical — see below.
 */
const QUEUE_RUN_DELAY_MS = 2000

/**
 * Run the `screening` queue a beat after the current transaction commits.
 *
 * A job row queued with `req` joins the caller's transaction, so a rolled-back
 * write never leaves an orphaned job — and the job cannot run until that
 * transaction commits. This is what runs it then, rather than leaving it to sit
 * until the next sweep.
 *
 * **Best-effort by construction, and never allowed to reject the caller.** A
 * failure is logged, and the queue's 15-minute autoRun (`payload.config.ts`) is
 * the safety net for a run lost to a crash or a restart: a row waits at most one
 * autoRun interval, never forever.
 *
 * Suppressed under `NODE_ENV=test`, where specs create rows freely and invoke
 * tasks deterministically — a background run two seconds later would race their
 * assertions.
 *
 * Both callers live in this intake's own pipeline: the create hook that queues
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
  if (process.env.NODE_ENV === 'test') return

  const { payload, label, context } = args
  setTimeout(() => {
    payload.jobs.run({ queue: 'screening' }).catch((error: unknown) => {
      payload.logger.warn({
        msg: `${label}: immediate queue run failed — autoRun will retry`,
        ...context,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }, QUEUE_RUN_DELAY_MS).unref?.()
}
