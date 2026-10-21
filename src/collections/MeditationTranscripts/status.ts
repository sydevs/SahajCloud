import type { PayloadRequest } from 'payload'

import { extractID } from 'payload/shared'

import type { TranscriptStatus } from '@/lib/meditations/transcript'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'
import type { PayloadJob } from '@/payload-types'

/**
 * How far a transcript has got, read off the run that produces it.
 *
 * The row carries no status column: `deleteJobOnComplete` is off, so the job
 * row outlives its run and is the one record of what happened. A second column
 * tracking the same thing could disagree with it, and did — a run lost to a
 * restart left `processing` behind with nothing to clear it.
 *
 * `completed` is decided by the cues, not by the job: a job may finish having
 * written nothing (its recording was replaced mid-flight), and cues are what a
 * reader came for.
 */
export function deriveTranscriptStatus(
  segments: unknown,
  job: Pick<PayloadJob, 'completedAt' | 'hasError'> | null,
): TranscriptStatus {
  if (Array.isArray(segments) && segments.length > 0) return 'completed'
  // No job row is itself a failure: the row is created by the save that adds a
  // recording and the queue write follows it, so a row without one means that
  // write never landed.
  if (!job) return 'failed'
  if (job.hasError) return 'failed'
  return job.completedAt ? 'failed' : 'processing'
}

/** The run's own error message, or null while nothing has failed. */
export function transcriptJobError(job: Pick<PayloadJob, 'error'> | null): string | null {
  const error = job?.error
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return null
}

/**
 * The job row this transcript names, or null.
 *
 * ⚠ **No `req`.** A virtual field's `afterRead` also runs on the response of a
 * write, and forwarding the request would join that transaction — a read that
 * went wrong would then roll the write back (`src/collections/AGENTS.md`). The
 * memo is still keyed on `req`, so the two virtual fields below cost one read.
 */
export function loadTranscriptJob(
  req: PayloadRequest,
  job: number | { id: number } | null | undefined,
): Promise<PayloadJob | null> {
  if (job === null || job === undefined) return Promise.resolve(null)
  const id = extractID(job)

  return memoizeOnRequest(
    req,
    `transcriptJob:${id}`,
    async () =>
      (await req.payload.findByID({
        collection: 'payload-jobs',
        id,
        depth: 0,
        overrideAccess: true,
        disableErrors: true,
      })) ?? null,
  )
}
