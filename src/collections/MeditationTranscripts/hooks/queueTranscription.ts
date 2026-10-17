import type { CollectionAfterChangeHook } from 'payload'

import { runQueueSoon } from '@/lib/jobs/runQueueSoon'

/**
 * afterChange: a new transcript row is a request to transcribe its recording.
 *
 * The row is the request, so the run is queued here rather than by whoever
 * created it — a `meditations` save, a seed, or an editor in the admin all get
 * the same behaviour, and nothing can create a row that transcribes nothing.
 *
 * The job row is queued **inside the caller's transaction** (`req` passed), so a
 * rolled-back save never leaves an orphaned job — which is also why the queue
 * run says `afterCommit`.
 *
 * `job` is written back in a second update rather than at create time, because
 * the job row does not exist until this hook runs. That update re-enters this
 * hook as `update`, which the guard below returns on.
 */
export const queueTranscription: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create') return doc
  // A row created with cues is an import of a transcript that already exists
  // (`seeds/meditation-transcripts/`), not a request to produce one. Queueing
  // there would pay the vendor to re-transcribe the whole library.
  if (Array.isArray(doc.segments) && doc.segments.length > 0) return doc

  const job = await req.payload.jobs.queue({
    task: 'transcribeMeditation',
    input: { meditationId: Number(resolveId(doc.meditation)), audioFilename: doc.audioFilename },
    queue: 'transcription',
    req,
  })

  await req.payload.update({
    collection: 'meditation-transcripts',
    id: doc.id,
    data: { job: job.id },
    depth: 0,
    overrideAccess: true,
    req,
  })

  runQueueSoon({
    payload: req.payload,
    queue: 'transcription',
    label: 'queueTranscription',
    context: { transcript: doc.id },
    afterCommit: true,
  })

  return { ...doc, job: job.id }
}

const resolveId = (value: unknown): unknown =>
  typeof value === 'object' && value !== null ? (value as { id?: unknown }).id : value
