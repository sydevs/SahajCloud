import type { Payload } from 'payload'

/**
 * How long to wait when the caller queued its job row inside a transaction.
 *
 * Long enough for that transaction to have committed, short enough that nobody
 * waits on it. The autoRun safety net below is what makes the exact number
 * uncritical.
 */
const COMMIT_SETTLE_MS = 2000

/**
 * Run a job queue now, rather than leaving its rows until the next sweep.
 *
 * **Best-effort by construction, and never allowed to reject the caller.** A
 * failure is logged, and the queue's own autoRun (`src/jobs/queues.ts`) is the
 * safety net for a run lost to a crash or a restart: a row waits at most one
 * autoRun interval, never forever. So every queue kicked through here owes an
 * `autoRun` entry.
 *
 * Suppressed under `NODE_ENV=test`, where specs create rows freely and invoke
 * tasks deterministically — a background run would race their assertions.
 */
export function runQueueSoon(args: {
  payload: Payload
  queue: string
  /** Names the caller in the warning, so a failed run says which one. */
  label: string
  /** Whatever identifies the row, merged into the warning. */
  context?: Record<string, unknown>
  /**
   * Whether the caller queued its job row with `req`.
   *
   * Such a row joins the caller's transaction, so the job cannot run until that
   * transaction commits and the run has to wait a beat. A caller outside a
   * transaction leaves the row already visible, so the run goes on the next
   * tick. The fact, rather than a number, because every caller knows this about
   * itself and none of them should be choosing a delay.
   */
  afterCommit?: boolean
}): void {
  if (process.env.NODE_ENV === 'test') return

  const { payload, queue, label, context, afterCommit = false } = args
  setTimeout(
    () => {
      payload.jobs.run({ queue }).catch((error: unknown) => {
        payload.logger.warn({
          msg: `${label}: immediate queue run failed — autoRun will retry`,
          ...context,
          error: error instanceof Error ? error.message : String(error),
        })
      })
    },
    afterCommit ? COMMIT_SETTLE_MS : 0,
  ).unref?.()
}
