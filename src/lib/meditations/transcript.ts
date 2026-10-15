/**
 * The timestamped transcript of a meditation's recording, as stored on
 * `meditation-transcripts`.
 */
import { z } from 'zod'

/** Times are seconds from the start of the recording, kept to the millisecond. */
const transcriptSegmentSchema = z.strictObject({
  text: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
})

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
  /** Read from the stored `outdated` column, written when the audio is replaced. */
  outdated: boolean
  provider: TranscriptProvider | null
  segments: TranscriptSegment[]
  error: string | null
  updatedAt: string | null
}
