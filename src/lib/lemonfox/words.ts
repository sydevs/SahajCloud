/**
 * The word-timings half of Lemonfox's `verbose_json`, beside the segment half
 * in `normalize.ts`. Nothing here fetches.
 */
import { z } from 'zod'

import type { TimedWord } from '@/lib/utilities/subtitles'

/**
 * Lemonfox documents no schema for `verbose_json`, and its word timings arrive
 * in either of two layouts: on each segment (WhisperX) or as one top-level list
 * (OpenAI). A word Whisper could not align carries no times, so everything is
 * optional and an unknown key is ignored.
 */
const rawWordSchema = z.object({
  word: z.string().optional(),
  text: z.string().optional(),
  start: z.number().optional(),
  end: z.number().optional(),
})

const rawSegmentSchema = z.object({
  start: z.number(),
  words: z.array(rawWordSchema).optional(),
})

const rawResponseSchema = z.object({
  segments: z.array(rawSegmentSchema).optional(),
  words: z.array(rawWordSchema).optional(),
})

type RawWord = z.infer<typeof rawWordSchema>

/**
 * The provider answers in seconds; a cue counts milliseconds.
 *
 * ⚠ Not the `toMillis` of this module's ancestor (`edefc00b`), which divided
 * by 1000 again and so answered seconds at millisecond precision. Lifting that
 * one ships subtitles 1000× too fast.
 */
const toMilliseconds = (seconds: number): number => Math.round(Math.max(0, seconds) * 1000)

/**
 * Every timestamped word in a Lemonfox `verbose_json` body, in spoken order.
 *
 * A word missing either timestamp is dropped rather than given an estimated
 * one: a cue built from a guess seeks to the wrong place, which is worse than
 * one word fewer. Returns an empty list for a recording with no aligned
 * speech — music or silence — which is an answer about the recording, not a
 * failure to read the body. Throws only when the body is unreadable.
 */
export function normalizeLemonfoxWords(raw: unknown): TimedWord[] {
  const parsed = rawResponseSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error('Lemonfox returned a response this app cannot read.')
  }

  const segments = [...(parsed.data.segments ?? [])].sort((a, b) => a.start - b.start)
  const topLevel = parsed.data.words ?? []

  // Either layout alone, and the mixed body too: a segment carrying its own
  // words keeps them, and the top-level list fills the segments that carry
  // none. Reading both unconditionally would list a WhisperX word twice.
  const perSegment = segments.some((segment) => !segment.words)
    ? assignWordsToSegments(segments, topLevel)
    : segments.map<RawWord[]>(() => [])

  const words =
    segments.length > 0
      ? segments.flatMap((segment, index) => segment.words ?? perSegment[index] ?? [])
      : topLevel

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
