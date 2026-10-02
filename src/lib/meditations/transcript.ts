/**
 * The timestamped transcript of a meditation's recording, as stored on
 * `meditation-transcripts` and served by `GET /api/meditations/:id/transcript`.
 *
 * Shared by the collection, the Meditations transcript endpoints, the
 * `transcribeMeditation` task and the admin Transcript tab.
 */
import { z } from 'zod'

/** Times are seconds from the start of the recording, kept to the millisecond. */
const transcriptWordSchema = z.strictObject({
  text: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
})

const transcriptSegmentSchema = z.strictObject({
  text: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  words: z.array(transcriptWordSchema),
})

export const transcriptSegmentsSchema = z.array(transcriptSegmentSchema)

export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>

export const TRANSCRIPT_STATUSES = ['queued', 'processing', 'completed', 'failed'] as const

export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number]

/** `sample` marks placeholder text, produced where no Lemonfox key is configured. */
export const TRANSCRIPT_PROVIDERS = ['lemonfox', 'sample'] as const

export type TranscriptProvider = (typeof TRANSCRIPT_PROVIDERS)[number]

/**
 * A queued or processing transcript older than this is treated as stalled, and
 * can be requested again. Lemonfox transcribes 30 minutes of audio in about a
 * minute, so this is far past any healthy run — it exists for a run lost to a
 * restart, which leaves the row `processing` with nothing left to finish it.
 */
export const TRANSCRIPTION_STALL_MS = 15 * 60 * 1000

/** What the Transcript tab renders. `none` means no transcript was ever requested. */
export type TranscriptView = {
  status: TranscriptStatus | 'none'
  /** Queued or processing for longer than {@link TRANSCRIPTION_STALL_MS}. */
  stalled: boolean
  /** The meditation's audio has been replaced since this transcript was requested. */
  outdated: boolean
  provider: TranscriptProvider | null
  segments: TranscriptSegment[]
  error: string | null
  updatedAt: string | null
}
