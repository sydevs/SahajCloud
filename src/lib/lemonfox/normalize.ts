/**
 * Here rather than beside the HTTP client, because two writers share it: a
 * live transcription and the import of the library's existing transcript
 * files. Nothing in this module fetches.
 */
import { z } from 'zod'

import { ExpectedJobFailure } from '@/lib/jobs/expectedFailure'
import type { TranscriptSegment } from '@/lib/meditations/transcript'

/**
 * Lemonfox exposes an OpenAI-compatible `verbose_json`, but documents no
 * schema for it. Word timings may sit inside each segment (WhisperX) or in one
 * top-level list (OpenAI); nothing stores them, so this reads neither and both
 * layouts reduce to the same answer.
 */
const rawSegmentSchema = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
})

const rawResponseSchema = z.object({
  segments: z.array(rawSegmentSchema).optional(),
})

/** The provider answers in seconds; the stored cue shape counts milliseconds. */
const toMilliseconds = (seconds: number): number => Math.round(Math.max(0, seconds) * 1000)

/**
 * Reduce a Lemonfox `verbose_json` body to the stored segment shape.
 *
 * Throws when the body holds no timestamped segment, since a transcript the
 * editor cannot seek through is not one this feature can use.
 */
export function normalizeLemonfoxResponse(raw: unknown): TranscriptSegment[] {
  const parsed = rawResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error('Lemonfox returned a response this app cannot read.')
  }

  const segments = (parsed.data.segments ?? [])
    .filter((segment) => segment.text.trim())
    .sort((a, b) => a.start - b.start)
  if (segments.length === 0) {
    // An answer about the recording (music, silence), already shown on its row.
    throw new ExpectedJobFailure('Lemonfox returned no timestamped speech for this recording.')
  }

  return segments.map((segment) => {
    const startTimeMs = toMilliseconds(segment.start)
    return {
      content: segment.text.trim(),
      startTimeMs,
      endTimeMs: Math.max(startTimeMs, toMilliseconds(segment.end)),
    }
  })
}
