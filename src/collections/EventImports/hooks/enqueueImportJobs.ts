/**
 * Queues the job each stage owes, as the batch enters it.
 *
 * ⚠ **Keyed on the status it ENTERED, never on the status it holds.** A review
 * that saves an edit leaves the batch `review` and must queue nothing; a save
 * while `committing` — a job's own `progress` write — must not queue a second
 * commit. `previousDoc` is what tells a move from a stay.
 *
 * ⚠ **The row is queued inside the caller's transaction** (`req` passed), so a
 * rolled-back transition never leaves a job that would run against a batch that
 * never moved. That is also why the run is deferred rather than immediate — see
 * `runQueueAfterCommit`, which owns that contract and the autoRun net behind it.
 *
 * ⚠ **Two workers cannot hold one batch, and that is what replaces #874's
 * lease.** `jobs.enableConcurrencyControl` is on (`src/payload.config.ts`), so
 * one worker takes a job row at a time — and each job refuses to run unless the
 * batch is still in the status that queued it.
 */

import type { CollectionAfterChangeHook } from 'payload'

import { runQueueAfterCommit } from '@/lib/jobs/runQueueAfterCommit'
import type { EventImport } from '@/payload-types'

import { IMPORT_QUEUE } from '../constants'

/** The task each status queues on being entered. */
const ON_ENTERING: Partial<Record<NonNullable<EventImport['status']>, 'resolveEventImport' | 'commitEventImport'>> =
  {
    resolving: 'resolveEventImport',
    committing: 'commitEventImport',
  }

export const enqueueImportJobs: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  const batch = doc as EventImport
  const status = batch.status
  const entered = operation === 'create' || (previousDoc as EventImport | undefined)?.status !== status
  if (!entered) return doc

  const task = ON_ENTERING[status]
  if (!task) return doc

  // `event-imports` ids are Postgres serials, and both tasks declare
  // `type: 'number'` for the batch they name — so the narrowing is the tasks'
  // own contract rather than an assumption made here.
  const batchId = Number(batch.id)

  await req.payload.jobs.queue({ task, input: { batchId }, queue: IMPORT_QUEUE, req })

  runQueueAfterCommit({
    payload: req.payload,
    queue: IMPORT_QUEUE,
    label: 'enqueueImportJobs',
    context: { batchId, task },
  })

  return doc
}
