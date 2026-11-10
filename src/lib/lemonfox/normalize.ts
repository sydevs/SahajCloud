/**
 * Here rather than beside the HTTP client, because three writers share it: a
 * live transcription, the import of the library's existing transcript files,
 * and the subtitles endpoint. Nothing in this module fetches.
 *
 * ⚠ `normalizeLemonfoxResponse` still throws `ExpectedJobFailure` for a
 * recording with no speech, which is a `src/jobs/` concept in a module two
 * non-job callers now share. `normalizeLemonfoxWords` deliberately does not:
 * it answers `[]` and leaves the wording to its caller. Moving that decision
 * out to `TranscribeMeditation` is the follow-up; nothing depends on it today
 * because the endpoint calls only the words half.
 */
import { z } from 'zod'

import { ExpectedJobFailure } from '@/lib/jobs/expectedFailure'
import type { TranscriptSegment } from '@/lib/meditations/transcript'
import type { TimedWord } from '@/lib/utilities/subtitles'

/**
 * Lemonfox exposes an OpenAI-compatible `verbose_json`, but documents no
 * schema for it. Word timings may sit inside each segment (WhisperX) or in one
 * top-level list (OpenAI), and a word Whisper could not align carries no times
 * — so everything optional here really is, and an unknown key is ignored.
 */
const rawWordSchema = z.object({
  word: z.string().optional(),
  text: z.string().optional(),
  start: z.number().optional(),
  end: z.number().optional(),
})

const rawSegmentSchema = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
  words: z.array(rawWordSchema).optional(),
})

const rawResponseSchema = z.object({
  segments: z.array(rawSegmentSchema).optional(),
  words: z.array(rawWordSchema).optional(),
})

type RawWord = z.infer<typeof rawWordSchema>

const UNREADABLE = 'Lemonfox returned a response this app cannot read.'

/**
 * The provider answers in seconds; both stored shapes count milliseconds.
 *
 * ⚠ Not the `toMillis` of the ancestor these readers were lifted from
 * (`edefc00b`), which divided by 1000 again and so answered seconds at
 * millisecond precision. That one ships cues 1000× too fast.
 */
const toMilliseconds = (seconds: number): number => Math.round(Math.max(0, seconds) * 1000)

/**
 * Reduce a Lemonfox `verbose_json` body to the stored segment shape.
 *
 * Throws when the body holds no timestamped segment, since a transcript the
 * editor cannot seek through is not one this feature can use.
 */
export function normalizeLemonfoxResponse(raw: unknown): TranscriptSegment[] {
  const parsed = rawResponseSchema.safeParse(raw)
  if (!parsed.success) throw new Error(UNREADABLE)

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

/**
 * Every timestamped word in a Lemonfox `verbose_json` body, in spoken order —
 * the half the subtitles grouper reads (#1016).
 *
 * A word missing either timestamp is dropped rather than given an estimated
 * one: a cue built from a guess seeks to the wrong place, which is worse than
 * one word fewer, and the word still reads in its segment's text. Answers an
 * empty list for a recording with no aligned speech — music or silence — which
 * is an answer about the recording rather than a failure to read the body, and
 * one its caller words for the admin. Throws only when the body is unreadable.
 */
export function normalizeLemonfoxWords(raw: unknown): TimedWord[] {
  const parsed = rawResponseSchema.safeParse(raw)
  if (!parsed.success) throw new Error(UNREADABLE)

  const segments = [...(parsed.data.segments ?? [])].sort((a, b) => a.start - b.start)
  const topLevel = parsed.data.words ?? []

  // With no segments there is nothing to bucket into, so the top-level list is
  // the whole answer. Either layout alone, and the mixed body too: a segment
  // carrying its own words keeps them, and the top-level list fills the
  // segments that carry none. Reading both unconditionally would list a
  // WhisperX word twice.
  let words: RawWord[]
  if (segments.length === 0) {
    words = topLevel
  } else {
    // ⚠ Inside this branch only: `assignWordsToSegments` indexes by segment, so
    // it has nothing to bucket into when there are none.
    const buckets = assignWordsToSegments(segments, topLevel)
    // `?.length`, not `??`: a segment carrying `words: []` carries none, and
    // keeping that empty list would drop the words bucketed into it.
    words = segments.flatMap((segment, index) =>
      segment.words?.length ? segment.words : buckets[index]!,
    )
  }

  return words.flatMap((word) => {
    const content = (word.word ?? word.text ?? '').trim()
    if (!content || word.start === undefined || word.end === undefined) return []
    const startTimeMs = toMilliseconds(word.start)
    return [{ content, startTimeMs, endTimeMs: Math.max(startTimeMs, toMilliseconds(word.end)) }]
  })
}

/** Give each top-level word to the last segment that starts at or before it. */
function assignWordsToSegments(segments: { start: number }[], words: RawWord[]): RawWord[][] {
  const bySegment: RawWord[][] = segments.map(() => [])
  for (const word of words) {
    const at = word.start ?? Number.NEGATIVE_INFINITY
    let index = 0
    while (index + 1 < segments.length && segments[index + 1]!.start <= at) index += 1
    bySegment[index]!.push(word)
  }
  return bySegment
}
