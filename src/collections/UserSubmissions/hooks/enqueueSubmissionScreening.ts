import type { CollectionAfterChangeHook } from 'payload'

import { runScreeningQueueAfterCommit } from '../screeningQueue'

/**
 * afterChange (create): queue screening for a fresh submission.
 *
 * The job row is queued **inside the caller's transaction** (`req` passed) so a
 * rolled-back submission never leaves an orphaned job. That is also why the
 * queue run is deferred rather than immediate — see `runScreeningQueueAfterCommit`,
 * which owns that contract and the autoRun safety net behind it.
 */
export const enqueueSubmissionScreening: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create') return doc
  // `pending` is the status a row carries while it waits to be screened. Only a
  // fresh intake is: an import, or a spec that pins a terminal status at create
  // time, has already decided, and re-screening would overwrite that decision
  // with a machine's.
  if (doc.status !== 'pending') return doc

  // `user-submissions` ids are Postgres serials, and `screenSubmission` declares
  // `type: 'number'` for the row it names — so the narrowing is the task's own
  // contract, not an assumption made here.
  const submissionId = Number(doc.id)

  await req.payload.jobs.queue({
    task: 'screenSubmission',
    input: { submissionId },
    queue: 'screening',
    req,
  })

  runScreeningQueueAfterCommit({
    payload: req.payload,
    label: 'enqueueSubmissionScreening',
    context: { submissionId },
  })

  return doc
}
