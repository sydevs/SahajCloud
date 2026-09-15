import type { CollectionAfterChangeHook } from 'payload'

/**
 * afterChange (create): queue screening for a fresh submission.
 *
 * The job row is queued **inside the caller's transaction** (`req` passed), so
 * a rolled-back submission never leaves an orphaned job. That also means the
 * job cannot run until the transaction commits — hence the deferred kick below,
 * which runs the queue a beat later, outside the request.
 *
 * The `screening` queue's 15-minute autoRun (`payload.config.ts`) is the safety
 * net for a kick lost to a crash or a restart: a submission sits `pending` for
 * at most one autoRun interval, never forever.
 */
export const enqueueSubmissionScreening: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create') return doc
  // Only fresh intakes are screened. An import or a spec that pins a terminal
  // status at create time has already decided, and re-screening would overwrite
  // that decision with a machine's.
  if (doc.status !== 'pending') return doc

  await req.payload.jobs.queue({
    task: 'screenSubmission',
    input: { submissionId: doc.id },
    queue: 'screening',
    req,
  })

  // Best-effort, and never allowed to reject the request: a failure here is
  // logged and the autoRun sweep retries. Suppressed in tests, where specs
  // create rows freely and invoke the task deterministically — a background
  // kick two seconds later would race their assertions.
  if (process.env.NODE_ENV === 'test') return doc
  const payload = req.payload
  setTimeout(() => {
    payload.jobs.run({ queue: 'screening' }).catch((error: unknown) => {
      payload.logger.warn({
        msg: 'enqueueSubmissionScreening: immediate queue run failed — autoRun will retry',
        submissionId: doc.id,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }, 2000).unref?.()

  return doc
}
