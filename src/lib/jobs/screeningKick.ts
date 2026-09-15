import type { CollectionAfterChangeHook, Payload, PayloadRequest } from 'payload'

/**
 * How long to wait before running the queue.
 *
 * Long enough for the caller's transaction to have committed, short enough that
 * nobody waits on it. The queue's own autoRun is what makes the exact number
 * uncritical — see `kickQueue`.
 */
const KICK_DELAY_MS = 2000

/**
 * Run a queue a beat after the current transaction commits.
 *
 * A job row queued with `req` joins the caller's transaction, so a rolled-back
 * write never leaves an orphaned job — and the job cannot run until that
 * transaction commits. This is the kick that runs it then, rather than leaving
 * it to sit.
 *
 * **Best-effort by construction, and never allowed to reject the caller.** A
 * failure is logged, and the queue's 15-minute autoRun (`payload.config.ts`) is
 * the safety net for a kick lost to a crash or a restart: a row waits at most
 * one autoRun interval, never forever.
 *
 * Suppressed under `NODE_ENV=test`, where specs create rows freely and invoke
 * tasks deterministically — a background run two seconds later would race their
 * assertions.
 */
export function kickQueue(args: {
  payload: Payload
  queue: string
  /** Names the caller in the warning, so a failed kick says which one. */
  label: string
  /** Whatever identifies the row, merged into the warning. */
  context?: Record<string, unknown>
}): void {
  if (process.env.NODE_ENV === 'test') return

  const { payload, queue, label, context } = args
  setTimeout(() => {
    payload.jobs.run({ queue }).catch((error: unknown) => {
      payload.logger.warn({
        msg: `${label}: immediate queue run failed — autoRun will retry`,
        ...context,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }, KICK_DELAY_MS).unref?.()
}

/**
 * The afterChange hook that queues screening for a fresh intake.
 *
 * ⚠ **One mechanism, not one queue call.** Three collections had a near-identical
 * copy of this — `user-submissions`, `event-submissions` and `user-messages` —
 * differing only in task slug, input key and status sentinel, which is the
 * three-consumer threshold #791 promoted `hasMxRecords` on. What was actually
 * duplicated is the *mechanism*: the create guard, the sentinel, the deferred
 * kick and its log line. The queue call itself is not, so it stays at each call
 * site with its own literal task slug — passing that through as a union would
 * need a cast, and trade the duplication for lost type safety.
 *
 * `ready` is the status a row carries when it is waiting to be screened. Only
 * fresh intakes are: an import, or a spec that pins a terminal status at create
 * time, has already decided, and re-screening would overwrite that decision
 * with a machine's.
 */
export function screeningKickHook(args: {
  ready: string
  label: string
  queue: (context: { doc: { id: number }; req: PayloadRequest }) => Promise<unknown>
  /** The queue to kick. Defaults to the shared `screening` queue. */
  queueName?: string
}): CollectionAfterChangeHook {
  const { ready, label, queue, queueName = 'screening' } = args

  return async ({ doc, operation, req }) => {
    if (operation !== 'create') return doc
    if (doc.status !== ready) return doc

    // All three collections are Postgres serial ids, and every screening task
    // declares `type: 'number'` for the row it names — so the narrowing is the
    // task's own contract, not an assumption made here.
    const id = Number(doc.id)

    await queue({ doc: { id }, req })

    kickQueue({ payload: req.payload, queue: queueName, label, context: { docId: id } })

    return doc
  }
}
