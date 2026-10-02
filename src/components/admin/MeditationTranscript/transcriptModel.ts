import type {
  TranscriptSegment,
  TranscriptView,
  TranscriptWord,
} from '@/lib/meditations/transcript'

/** A pause this long between phrases starts a new paragraph. */
export const PARAGRAPH_GAP_SECONDS = 3

/** A pause this long is shown as "A moment of silence". */
export const SILENCE_GAP_SECONDS = 10

/** The playhead keeps a phrase highlighted this long after it ends. */
const HIGHLIGHT_GRACE_SECONDS = 0.5

export type TranscriptParagraph = {
  start: number
  /** Positions in the segment array, so a phrase keeps one index everywhere. */
  segmentIndexes: number[]
  /** A silence follows this paragraph before the next one starts. */
  silenceAfter: boolean
}

/**
 * The transcript endpoint's URL, or `null` without a document id or a locale.
 *
 * The endpoint checks the manager's roles at `req.locale`, so the request must
 * name the active admin locale (#701). `useLocale()` can yield no code at
 * runtime, and `?locale=undefined` silently resolves to the default locale.
 */
export const transcriptUrl = (
  meditationId: number | string | undefined,
  locale: string | undefined,
): string | null =>
  meditationId && locale
    ? `/api/meditations/${meditationId}/transcript?locale=${encodeURIComponent(locale)}`
    : null

export type TranscriptPhase = 'none' | 'pending' | 'stalled' | 'failed' | 'outdated' | 'completed'

/**
 * What the tab shows. A replaced recording outranks every status: whatever was
 * requested, it was for audio the meditation no longer has.
 */
export function transcriptPhase(view: TranscriptView): TranscriptPhase {
  if (view.status === 'none') return 'none'
  if (view.outdated) return 'outdated'
  if (view.status === 'completed' || view.status === 'failed') return view.status
  return view.stalled ? 'stalled' : 'pending'
}

/** Split the phrases into paragraphs at pauses, and mark the long ones. */
export function groupTranscript(segments: TranscriptSegment[]): TranscriptParagraph[] {
  const paragraphs: TranscriptParagraph[] = []
  segments.forEach((segment, index) => {
    const previous = segments[index - 1]
    const gap = previous ? segment.start - previous.end : Number.POSITIVE_INFINITY
    const current = paragraphs[paragraphs.length - 1]
    if (current && gap < PARAGRAPH_GAP_SECONDS) {
      current.segmentIndexes.push(index)
      return
    }
    if (current) current.silenceAfter = gap >= SILENCE_GAP_SECONDS
    paragraphs.push({ start: segment.start, segmentIndexes: [index], silenceAfter: false })
  })
  return paragraphs
}

export type TranscriptToken = {
  text: string
  /** The timed word this token is, or `null` for one Whisper gave no times. */
  wordIndex: number | null
}

/** How far ahead a token looks for its word, so one untimed word strands no others. */
const ALIGN_LOOKAHEAD = 3

const comparable = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

/**
 * Split a phrase's text into the tokens it reads as, each tied to its timed
 * word. The text, not the word list, is what renders: the normalizer drops a
 * word Whisper could not time, and the phrase must still read in full.
 */
export function alignWords(text: string, words: TranscriptWord[]): TranscriptToken[] {
  let next = 0
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const key = comparable(token)
      const end = Math.min(words.length, next + ALIGN_LOOKAHEAD)
      for (let index = next; key && index < end; index += 1) {
        if (comparable(words[index].text) === key) {
          next = index + 1
          return { text: token, wordIndex: index }
        }
      }
      return { text: token, wordIndex: null }
    })
}

/** The word being spoken at `time`, or `-1` before the first. */
export function activeWordIndex(words: TranscriptWord[], time: number): number {
  for (let index = words.length - 1; index >= 0; index -= 1) {
    if (words[index].start <= time) return index
  }
  return -1
}

/** The phrase being spoken at `time`, or `-1` in a pause. */
export function activeSegmentIndex(segments: TranscriptSegment[], time: number): number {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index]
    if (segment.start <= time) {
      return time < segment.end + HIGHLIGHT_GRACE_SECONDS ? index : -1
    }
  }
  return -1
}
