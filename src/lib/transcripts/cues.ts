import type { TranscriptSegment } from './schema'

/**
 * One spoken word with its own timings, in the same milliseconds a cue counts.
 *
 * Here rather than beside the Lemonfox reader that produces it: the grouper
 * below is this app's cue vocabulary, not the vendor's, so a second provider
 * reads into this shape instead of teaching the grouper its own.
 */
export type TimedWord = {
  content: string
  startTimeMs: number
  endTimeMs: number
}

/**
 * The house cue length, measured against the 1,102 cues already stored: median
 * 26 characters, p95 exactly 30.
 */
export const SUBTITLE_CUE_MAX_CHARS = 30

/**
 * A silence this long ends a cue, whatever its length.
 *
 * The value is the transcript tab's own paragraph break
 * (`TranscriptPanel/transcriptModel.ts`), taken rather than picked so one
 * pause reads as a break on both screens the day this shipped. Nothing holds
 * the two together since: they answer different questions, and tuning one is
 * not a reason to tune the other.
 */
export const SUBTITLE_CUE_MAX_GAP_MS = 3000

/**
 * Group spoken words into subtitle cues of at most {@link SUBTITLE_CUE_MAX_CHARS}
 * characters.
 *
 * A pause of {@link SUBTITLE_CUE_MAX_GAP_MS} ends a cue too, so a line does not
 * linger on screen across a silence.
 *
 * A cue takes its start from its first word and its end from its last, so a
 * silence between two words stays a silence: nothing stretches a cue to meet
 * the next one. A single word longer than the limit is its own cue and exceeds
 * it — splitting a word mid-syllable reads worse than one long line.
 */
export function groupWordsIntoCues(words: readonly TimedWord[]): TranscriptSegment[] {
  const cues: TranscriptSegment[] = []
  let line: TimedWord[] = []
  let length = 0

  const flush = () => {
    if (line.length === 0) return
    const first = line[0]!
    const last = line[line.length - 1]!
    cues.push({
      content: line.map((word) => word.content).join(' '),
      startTimeMs: first.startTimeMs,
      endTimeMs: Math.max(first.startTimeMs, last.endTimeMs),
    })
    line = []
    length = 0
  }

  for (const word of words) {
    const content = word.content.trim()
    if (!content) continue
    const previous = line[line.length - 1]
    if (previous && word.startTimeMs - previous.endTimeMs >= SUBTITLE_CUE_MAX_GAP_MS) flush()
    // The space before this word is what the limit has to account for, and the
    // first word of a cue needs none. Measured after the flush, never before:
    // a length computed against the old line is one too big for the new one.
    if (line.length > 0 && length + content.length + 1 > SUBTITLE_CUE_MAX_CHARS) flush()
    line.push({ ...word, content })
    length += line.length === 1 ? content.length : content.length + 1
  }
  flush()

  return cues
}
