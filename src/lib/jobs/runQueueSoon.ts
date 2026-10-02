import type { Payload } from 'payload'

/**
 * Run a job queue now, rather than leaving its rows until the next sweep.
 *
 * **Best-effort by construction, and never allowed to reject the caller.** A
 * failure is logged, and the queue's own autoRun (`payload.config.ts`) is the
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
   * How long to wait before running. `0` runs on the next tick.
   *
   * A caller that queued its job row with `req` put that row inside its own
   * transaction, and the job cannot run until the transaction commits — so it
   * must wait a beat. One queueing outside a transaction leaves the row already
   * visible and passes `0`.
   */
  delayMs?: number
}): void {
  if (process.env.NODE_ENV === 'test') return

  const { payload, queue, label, context, delayMs = 0 } = args
  setTimeout(() => {
    payload.jobs.run({ queue }).catch((error: unknown) => {
      payload.logger.warn({
        msg: `${label}: immediate queue run failed — autoRun will retry`,
        ...context,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }, delayMs).unref?.()
}
