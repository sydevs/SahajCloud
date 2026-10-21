import * as qs from 'qs-esm'

import {
  type JobStageConfig,
  jobStageIsRunning,
  jobStageIsStale,
} from '@/components/admin/JobStageView/stages'
import type { TranscriptSegment } from '@/lib/meditations/transcript'
import type { MeditationTranscript } from '@/payload-types'

/** The collection the tab reads, and whose `jobStage` declaration it follows. */
export const TRANSCRIPTS_SLUG = 'meditation-transcripts'

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
 */
export const transcriptUrl = (
  meditationId: number | string | undefined,
  locale: string | undefined,
): string | null =>
  meditationId && locale
    ? `/api/${TRANSCRIPTS_SLUG}${qs.stringify(
        { depth: 0, limit: 1, locale, where: { meditation: { equals: meditationId } } },
        { addQueryPrefix: true },
      )}`
    : null

export type TranscriptPhase = 'none' | 'pending' | 'stalled' | 'failed' | 'completed'

/**
 * Which notice the tab shows. No row means never transcribed: a replaced
 * recording takes its row with it and a fresh one is queued at once, so there
 * is no out-of-date transcript to keep on screen.
 *
 * Which stages are a wait, and how long one may stand, are read off the
 * collection's own `jobStage` declaration rather than named here, so the tab
 * and the row's Edit view cannot disagree about either. `failed` stays a
 * literal: it is this collection's terminal status, not a running stage.
 */
export function transcriptPhase(
  config: JobStageConfig,
  row: Pick<MeditationTranscript, 'status' | 'updatedAt'> | undefined,
  now: number = Date.now(),
): TranscriptPhase {
  if (!row) return 'none'
  if (row.status === 'failed') return 'failed'
  if (jobStageIsRunning(config, row.status)) {
    return jobStageIsStale(config, row, now) ? 'stalled' : 'pending'
  }
  return 'completed'
}

/** Split the phrases into paragraphs at pauses, and mark the long ones. */
export function groupTranscript(segments: TranscriptSegment[]): TranscriptParagraph[] {
  const paragraphs: TranscriptParagraph[] = []
  segments.forEach((segment, index) => {
    const previous = segments[index - 1]
    const gap = previous ? segment.startTimeMs - previous.endTimeMs : Number.POSITIVE_INFINITY
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
 * The phrase being spoken at `playheadSeconds`, or `-1` in a pause.
 *
 * A phrase counts from the whole second it starts in, because a click seeks
 * there and the preview reports only whole seconds — so it must light up at
 * once rather than a fraction of a second later.
 */
export function activeSegmentIndex(segments: TranscriptSegment[], playheadSeconds: number): number {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index]
    if (seekSecond(segment.startTimeMs) <= playheadSeconds) {
      return playheadSeconds < segment.endTimeMs / 1000 + HIGHLIGHT_GRACE_SECONDS ? index : -1
    }
  }
  return -1
}
