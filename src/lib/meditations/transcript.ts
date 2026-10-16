/**
 * The timestamped transcript of a meditation's recording, as stored on
 * `meditation-transcripts`.
 */
import { z } from 'zod'

import { subtitleCue } from '@/lib/utilities/subtitles'

/**
 * The subtitle cue shape, closed: times are milliseconds from the start of the
 * recording. One shape, so a player reading a transcript and a player reading
 * subtitles read the same cue (#957).
 *
 * Closed where `subtitles` is open: only this app's own transcription writes
 * here, so no stored row can be stranded by refusing an unknown key — and
 * refusing one is what keeps word timings out, which were 85% of the bytes
 * with no consumer.
 */
const transcriptSegmentSchema = z.strictObject(subtitleCue)

export const transcriptSegmentsSchema = z.array(transcriptSegmentSchema)

export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>

export const TRANSCRIPT_STATUSES = ['queued', 'processing', 'completed', 'failed'] as const

export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number]

/**
 * One provider, and no placeholder. A transcript that cannot be produced is a
 * row with `status: 'failed'` and an `error` — never invented text wearing a
 * provider's name (#897, success line 13).
 */
export const TRANSCRIPT_PROVIDERS = ['lemonfox'] as const

export type TranscriptProvider = (typeof TRANSCRIPT_PROVIDERS)[number]

/**
 * A queued or processing transcript older than this may be requested again.
 * Far past any healthy run — it exists for a run lost to a restart, which
 * leaves the row `processing` with nothing left to finish it.
 */
export const TRANSCRIPTION_STALL_MS = 15 * 60 * 1000

/** What the Transcript tab renders. `none` means no transcript was ever requested. */
export type TranscriptView = {
  status: TranscriptStatus | 'none'
  /** Queued or processing for longer than {@link TRANSCRIPTION_STALL_MS}. */
  stalled: boolean
  /**
   * Read from the stored `outdated` column: set when the audio is replaced, and
   * cleared only by a completed run for the current recording.
   */
  outdated: boolean
  provider: TranscriptProvider | null
  segments: TranscriptSegment[]
  error: string | null
  updatedAt: string | null
}
