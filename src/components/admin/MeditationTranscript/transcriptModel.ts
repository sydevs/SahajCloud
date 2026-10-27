import * as qs from 'qs-esm'

import type { TranscriptSegment } from '@/lib/meditations/transcript'

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
    ? `/api/meditation-transcripts${qs.stringify(
        { depth: 0, limit: 1, locale, where: { meditation: { equals: meditationId } } },
        { addQueryPrefix: true },
      )}`
    : null

/**
 * Where the Transcribe-again button posts, or `null` without a document id or a
 * locale — `transcriptUrl`'s own docblock carries why both are required.
 */
export const transcribeUrl = (
  meditationId: number | string | undefined,
  locale: string | undefined,
): string | null =>
  meditationId && locale
    ? `/api/meditations/${meditationId}/transcribe${qs.stringify(
        { locale },
        { addQueryPrefix: true },
      )}`
    : null

/**
 * Whether the Transcribe-again button may be offered for a meditation in
 * `documentLocale`, to a manager editing in `requestLocale`.
 *
 * The endpoint refuses a non-admin manager outside the meditation's own
 * language (`src/plugins/access/localeScopedWrites.ts`, #980), so the control
 * is not offered there either: a button that can only answer 403 is what the
 * access layer avoided for Save. Mirrored here rather than imported, because
 * the module owning that refusal pulls `payload` in with it and this one is
 * read by a `'use client'` component.
 *
 * Admins are unaffected, as the admin bypass is, and an unread language offers
 * the button — the endpoint is what refuses, never this.
 */
export const mayTranscribeLocale = (
  user: { collection?: string; type?: string } | null | undefined,
  requestLocale: string | undefined,
  documentLocale: unknown,
): boolean => {
  if (user?.collection !== 'managers' || user.type === 'admin') return true
  return typeof documentLocale !== 'string' || documentLocale === requestLocale
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
