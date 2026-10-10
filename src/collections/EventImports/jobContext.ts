/**
 * How a job writes to a batch: the marker that gets it past the transition
 * table, and the two writes every import job owes when it goes wrong.
 *
 * ⚠ **`transitionStatus` refuses to a caller exactly what a job must do** —
 * set a terminal status, advance `progress`, rewrite `rows` with the geocoder's
 * answers, store the `report`. So a job cannot be recognised by what it writes,
 * and it runs with no `req.user`, so it cannot be recognised by who it is
 * either. `EVENT_IMPORT_JOB` is the recognition.
 *
 * ⚠ **Only a task handler may set it.** Nothing reaches `req.context` from
 * outside the server — a REST caller's body cannot name it — so the marker is
 * sound as long as every setter is a job. Keep it that way: an endpoint or a
 * component that needed this would be asking to skip the transition table.
 */

import type { PayloadRequest, TaskConfig } from 'payload'

import type { EventImport } from '@/payload-types'

/** The `req.context` key, spelled once so a typo cannot silently open the gate. */
export const EVENT_IMPORT_JOB = 'eventImportJob'

/**
 * A copy of the job's request that `transitionStatus` lets through.
 *
 * A copy rather than a mutation: the task's own `req` is what the job's reads
 * travel on, and marking it would mark every nested write a hook of theirs sets
 * off.
 */
export function jobWriteReq(req: PayloadRequest): PayloadRequest {
  return { ...req, context: { ...req.context, [EVENT_IMPORT_JOB]: true } } as PayloadRequest
}

/**
 * Write a batch's `error`, and its `status` only when the job is giving up.
 *
 * ⚠ **The message is stored on every attempt; the status moves once.** Payload's
 * `onFail` carries no error (`queues/errors/handleTaskError.js`), so a status
 * written only there would read "failed" with nothing saying why — and a status
 * written on the first attempt would show a volunteer a Retry button while the
 * queue is still retrying by itself.
 *
 * A failure of this write is logged rather than thrown: throwing here would
 * replace the real fault with a write error in the job log.
 */
export async function recordBatchFailure(args: {
  req: PayloadRequest
  batchId: number
  /**
   * What the volunteer reads. Keep it about the batch, not about the stack.
   * Omitted by `onFail`, which has no error and must not blank the one stored.
   */
  error?: string
  /** Whether this attempt is the last one, so `failed` is the batch's answer. */
  final: boolean
}): Promise<void> {
  const { req, batchId, error, final } = args
  try {
    await req.payload.update({
      collection: 'event-imports',
      id: batchId,
      data: {
        ...(error === undefined ? {} : { error }),
        ...(final ? { status: 'failed' satisfies NonNullable<EventImport['status']> } : {}),
      },
      overrideAccess: true,
      depth: 0,
      // The answer is in hand already, and the document carries up to 500 rows
      // plus its tree — all of which an unbounded update re-reads to discard.
      select: { status: true },
      req: jobWriteReq(req),
    })
  } catch (failure) {
    req.payload.logger.error(
      { err: failure, batch: batchId },
      'Failed event import could not be marked',
    )
  }
}

/**
 * The `onFail` that moves a batch to `failed` once its attempts are spent.
 *
 * ⚠ **`onFail` runs on every attempt, not only the last.** Payload calls it
 * before it decides whether to retry, and the test it then applies is
 * `totalTried >= retries` — repeated here, against the same number the task
 * declares, because there is no flag in the callback's arguments for it.
 */
export function failBatchWhenSpent(retries: number): NonNullable<TaskConfig['onFail']> {
  return async ({ input, req, taskStatus }) => {
    if ((taskStatus?.totalTried ?? 0) < retries) return
    const batchId = Number((input as { batchId?: unknown } | undefined)?.batchId)
    if (!Number.isInteger(batchId)) return
    // No `error`: the attempt that just threw stored its own, and Payload writes
    // `job.error` only after this callback returns.
    await recordBatchFailure({ req, batchId, final: true })
  }
}
