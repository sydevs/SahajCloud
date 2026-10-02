import type { PayloadRequest } from 'payload'

import { TRANSCRIPTION_STALL_MS, type TranscriptView } from '@/lib/meditations/transcript'
import type { MeditationTranscript } from '@/payload-types'

/**
 * The meditation's current recording, or `null` when there is no such
 * meditation.
 *
 * Reads the latest draft: the editor hears and places frames against the
 * draft's audio, so that is the recording a transcript must match.
 */
export async function findMeditationRecording(
  req: PayloadRequest,
  meditationId: number,
): Promise<{ filename: string | null } | null> {
  const meditation = await req.payload.findByID({
    collection: 'meditations',
    id: meditationId,
    depth: 0,
    draft: true,
    select: { filename: true },
    overrideAccess: true,
    disableErrors: true,
    req,
  })
  return meditation ? { filename: meditation.filename ?? null } : null
}

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

export function toTranscriptView(
  row: MeditationTranscript | undefined,
  currentFilename: string | null,
  now: number = Date.now(),
): TranscriptView {
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
  const pending = row.status === 'queued' || row.status === 'processing'
  return {
    status: row.status,
    stalled: pending && now - Date.parse(row.updatedAt) > TRANSCRIPTION_STALL_MS,
    outdated: row.audioFilename !== currentFilename,
    provider: row.provider ?? null,
    segments: row.segments ?? [],
    error: row.error ?? null,
    updatedAt: row.updatedAt,
  }
}

/** A request still on its way to a transcript of the current recording. */
export const isTranscriptionActive = (view: TranscriptView): boolean =>
  (view.status === 'queued' || view.status === 'processing') && !view.stalled && !view.outdated
