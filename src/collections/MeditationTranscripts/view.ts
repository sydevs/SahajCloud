import type { PayloadRequest } from 'payload'

import { TRANSCRIPTION_STALL_MS, type TranscriptView } from '@/lib/meditations/transcript'
import type { MeditationTranscript } from '@/payload-types'

/**
 * The meditation's current recording and locale, or `null` when there is no
 * such meditation.
 *
 * Reads the latest draft: the editor hears and places frames against the
 * draft's audio, so that is the recording a transcript must match. `locale` is
 * what a transcription request stores as the row's `language`.
 */
export async function findMeditationRecording(
  req: PayloadRequest,
  meditationId: number,
): Promise<{ filename: string | null; locale: MeditationTranscript['language'] } | null> {
  const meditation = await req.payload.findByID({
    collection: 'meditations',
    id: meditationId,
    depth: 0,
    draft: true,
    select: { filename: true, locale: true },
    overrideAccess: true,
    disableErrors: true,
    req,
  })
  if (!meditation) return null
  return {
    filename: meditation.filename ?? null,
    locale: meditation.locale as MeditationTranscript['language'],
  }
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

/**
 * ⚠ `outdated` is read, never derived. Comparing `audioFilename` against the
 * meditation's own would both miss #897's "the moment it is replaced" and mean
 * nothing across environments, where a preview key prefixes every filename.
 * `markTranscriptOutdated` writes the column during the replacing save.
 */
export function toTranscriptView(
  row: MeditationTranscript | undefined,
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
 * answers — the caller compares it.
 */
export const isTranscriptionActive = (
  row: MeditationTranscript | undefined,
  audioFilename: string,
  now?: number,
): boolean => {
  if (!row || row.audioFilename !== audioFilename) return false
  const view = toTranscriptView(row, now)
  return (view.status === 'queued' || view.status === 'processing') && !view.stalled
}
