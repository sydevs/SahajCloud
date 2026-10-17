import type { PayloadRequest } from 'payload'

import type { MeditationTranscript } from '@/payload-types'

/**
 * A meditation's transcript row, or nothing.
 *
 * `meditation` is unique, so there is at most one. Reads with
 * `overrideAccess`: both callers are the machinery that owns the row — the
 * `meditations` save that keeps it in step with the recording, and the task
 * that fills it in.
 */
export async function findTranscriptRow(
  req: PayloadRequest,
  meditationId: number,
): Promise<MeditationTranscript | undefined> {
  const { docs } = await req.payload.find({
    collection: 'meditation-transcripts',
    where: { meditation: { equals: meditationId } },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return docs[0]
}
