import type { CollectionAfterChangeHook } from 'payload'

/**
 * afterChange (create): queue the async screening task for a fresh submission.
 *
 * The job row is queued **inside the caller's transaction** (`req` passed) so
 * a rolled-back submission never leaves an orphaned job. That means the job
 * can't run until the transaction commits — so the immediate kick below is
 * deferred a beat and runs the queue outside the request. The `screening`
 * queue also has a 15-minute autoRun (payload.config.ts) as the safety net for
 * a kick lost to a crash or restart: a submission can sit in `screening` for
 * at most one autoRun interval, never forever.
 */
export const enqueueScreening: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create') return doc
  // Only fresh public/system intakes are screened; ops that pin a terminal
  // status at create time (tests, imports) are not.
  if (doc.status !== 'screening') return doc

  await req.payload.jobs.queue({
    task: 'screenEventSubmission',
    input: { submissionId: doc.id },
    queue: 'screening',
    req,
  })

  // Deferred kick: run the screening queue shortly after the transaction has
  // committed. Best-effort — failures are logged and the autoRun sweep
  // retries; never let this reject the request. Suppressed in tests: specs
  // create submissions freely and invoke the task deterministically via
  // runTaskHandler — a background kick 2s later would race their assertions.
  if (process.env.NODE_ENV === 'test') return doc
  const payload = req.payload
  setTimeout(() => {
    payload.jobs.run({ queue: 'screening' }).catch((error: unknown) => {
      payload.logger.warn({
        msg: 'enqueueScreening: immediate queue run failed — autoRun will retry',
        submissionId: doc.id,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }, 2000).unref?.()

  return doc
}
