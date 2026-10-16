import type { PayloadRequest } from 'payload'

import { TRANSCRIPTION_STALL_MS, type TranscriptView } from '@/lib/meditations/transcript'
import type { MeditationTranscript } from '@/payload-types'

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

/** Pending for longer than the stall bound, so nothing is coming to finish it. */
const isStalled = (row: MeditationTranscript): boolean =>
  (row.status === 'queued' || row.status === 'processing') &&
  Date.now() - Date.parse(row.updatedAt) > TRANSCRIPTION_STALL_MS

/**
 * ⚠ `outdated` is read, never derived. Comparing `audioFilename` against the
 * meditation's own would both miss #897's "the moment it is replaced" and mean
 * nothing across environments, where a preview key prefixes every filename.
 * `markTranscriptOutdated` writes the column during the replacing save.
 */
export function toTranscriptView(row: MeditationTranscript | undefined): TranscriptView {
  if (!row) {
    return {
      status: 'none',
      stalled: false,
      outdated: false,
      provider: null,
      segments: [],
      error: null,
      updatedAt: null,
    }
  }
  return {
    status: row.status,
    stalled: isStalled(row),
    outdated: row.outdated ?? false,
    provider: row.provider ?? null,
    segments: row.segments ?? [],
    error: row.error ?? null,
    updatedAt: row.updatedAt,
  }
}

/**
 * A request still on its way to a transcript of the current recording.
 *
 * `outdated` is not consulted: a row marked outdated carries the previous
 * recording's text, and whether a run is in flight is what `audioFilename`
 * answers.
 */
export const isTranscriptionActive = (row: MeditationTranscript, audioFilename: string): boolean =>
  row.audioFilename === audioFilename &&
  (row.status === 'queued' || row.status === 'processing') &&
  !isStalled(row)
