/**
 * The timestamped transcript of a recording — a meditation's or a file's — as
 * stored on `transcripts`.
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

/**
 * Derived, never stored: the retained job row is the one record of a run, so a
 * column beside it could disagree with it. `queued` is absent because nothing
 * can observe it — a request kicks its queue in the same breath, and a row
 * waiting on a worker and one held by it are the same wait to a reader.
 */
export const TRANSCRIPT_STATUSES = ['processing', 'completed', 'failed'] as const

export type TranscriptStatus = (typeof TRANSCRIPT_STATUSES)[number]

/**
 * Who wrote the cues, and no placeholder. A transcript that cannot be produced
 * is a row with `status: 'failed'` and an `error` — never invented text wearing
 * a provider's name (#897, success line 13).
 *
 * `imported` is the 28 hand-made Path Step intro cue sets, carried over from
 * the lesson column they lived in before transcripts belonged to the file
 * (#1016). Nothing writes it at run time.
 */
export const TRANSCRIPT_PROVIDERS = ['lemonfox', 'imported'] as const

export type TranscriptProvider = (typeof TRANSCRIPT_PROVIDERS)[number]

/**
 * Re-exported, not declared here: a `'use client'` consumer must reach the
 * bound without this module's zod schemas. `./bounds` says why.
 */
export { TRANSCRIPTION_STALL_MS } from './bounds'
