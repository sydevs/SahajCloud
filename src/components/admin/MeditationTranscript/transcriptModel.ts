import type { TranscriptSegment } from '@/lib/meditations/transcript'
import { TRANSCRIPTION_STALL_MS } from '@/lib/meditations/transcript'
import type { MeditationTranscript } from '@/payload-types'

/** A pause this long between phrases starts a new paragraph. */
const PARAGRAPH_GAP_MS = 3000

/** A pause this long is shown as "A moment of silence". */
const SILENCE_GAP_MS = 10000

/** The playhead keeps a phrase highlighted this long after it ends. */
const HIGHLIGHT_GRACE_SECONDS = 0.5

export type TranscriptParagraph = {
  startTimeMs: number
  /** Positions in the segment array, so a phrase keeps one index everywhere. */
  segmentIndexes: number[]
  /** A silence follows this paragraph before the next one starts. */
  silenceAfter: boolean
}

/**
 * The collection query the tab reads, or `null` without a document id or a
 * locale.
 *
 * A manager's roles are per locale, so the request must name the active admin
 * locale — one naming none resolves to the default locale and 403s a manager
 * whose roles live only elsewhere (#701). `useLocale()`'s context default is
 * `{}`, so `code` can be undefined at runtime, and `?locale=undefined` is
 * rewritten to the default locale, reproducing that bug invisibly. So this
 * refuses to build a URL instead, and the caller reports it.
 *
 * It reads the collection rather than `meditations.transcript`, which carries
 * the same row: that join resolves at page load and nothing re-reads it, so a
 * tab built on it could never show a run finishing.
 */
export const transcriptUrl = (
  meditationId: number | string | undefined,
  locale: string | undefined,
): string | null =>
  meditationId && locale
    ? `/api/meditation-transcripts?where[meditation][equals]=${encodeURIComponent(String(meditationId))}` +
      `&limit=1&depth=0&locale=${encodeURIComponent(locale)}`
    : null

export type TranscriptPhase = 'none' | 'pending' | 'stalled' | 'failed' | 'completed'

/**
 * What the tab shows. No row is "never transcribed": a replaced recording
 * takes its row with it and a fresh one is queued at once, so there is no
 * out-of-date transcript to keep on screen.
 *
 * `stalled` is derived rather than stored. `TRANSCRIPTION_STALL_MS` is the
 * bound the collection already passes to `jobStage.staleAfterMs`, so the tab
 * and the row's own Edit view go stale together.
 */
export function transcriptPhase(
  row: Pick<MeditationTranscript, 'status' | 'updatedAt'> | undefined,
  now: number = Date.now(),
): TranscriptPhase {
  if (!row) return 'none'
  if (row.status === 'failed') return 'failed'
  if (row.status === 'processing') {
    return now - Date.parse(row.updatedAt) > TRANSCRIPTION_STALL_MS ? 'stalled' : 'pending'
  }
  return 'completed'
}

/** Split the phrases into paragraphs at pauses, and mark the long ones. */
export function groupTranscript(segments: TranscriptSegment[]): TranscriptParagraph[] {
  const paragraphs: TranscriptParagraph[] = []
  segments.forEach((segment, index) => {
    const previous = segments[index - 1]
    const gap = previous
      ? segment.startTimeMs - previous.endTimeMs
      : Number.POSITIVE_INFINITY
    const current = paragraphs[paragraphs.length - 1]
    if (current && gap < PARAGRAPH_GAP_MS) {
      current.segmentIndexes.push(index)
      return
    }
    if (current) current.silenceAfter = gap >= SILENCE_GAP_MS
    paragraphs.push({
      startTimeMs: segment.startTimeMs,
      segmentIndexes: [index],
      silenceAfter: false,
    })
  })
  return paragraphs
}

/** The whole second a phrase or paragraph plays from, which is what a seek asks for. */
export const seekSecond = (timeMs: number): number => Math.floor(timeMs / 1000)

/**
 * The phrase being spoken at `playheadSeconds`, or `-1` in a pause. A phrase
 * counts from the whole second it starts in: clicking it seeks there, and the
 * preview reports only whole seconds, so it must light up at once.
 */
export function activeSegmentIndex(
  segments: TranscriptSegment[],
  playheadSeconds: number,
): number {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index]
    if (seekSecond(segment.startTimeMs) <= playheadSeconds) {
      return playheadSeconds < segment.endTimeMs / 1000 + HIGHLIGHT_GRACE_SECONDS ? index : -1
    }
  }
  return -1
}
