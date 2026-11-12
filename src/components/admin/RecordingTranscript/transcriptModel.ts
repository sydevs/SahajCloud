import * as qs from 'qs-esm'

import type { RecordingCollection } from '@/lib/transcripts/media'
import type { TranscriptSegment } from '@/lib/transcripts/schema'

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
 * The collection query the panel reads, or `null` without a recording id or a
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
  recordingId: number | string | undefined,
  locale: string | undefined,
  relationTo: RecordingCollection = 'meditations',
): string | null =>
  recordingId && locale
    ? `/api/transcripts${qs.stringify(
        {
          depth: 0,
          limit: 1,
          locale,
          // `qs` serialises the nested object, and `sanitizeQueryValue` reads
          // it back through the same guard the Local API uses.
          where: { source: { equals: { relationTo, value: recordingId } } },
        },
        { addQueryPrefix: true },
      )}`
    : null

/**
 * The read of a file an upload field holds, or `null` without a file id or a
 * locale (`transcriptUrl` says why). A list read with an `id` filter rather
 * than a document read, so a file the editor cannot read answers an empty list
 * instead of an error.
 */
export const fileUrl = (fileId: number | null, locale: string | undefined): string | null =>
  fileId && locale
    ? `/api/files${qs.stringify(
        {
          depth: 0,
          limit: 1,
          locale,
          select: { filename: true, mimeType: true, mp4Url: true, url: true },
          where: { id: { equals: fileId } },
        },
        { addQueryPrefix: true },
      )}`
    : null

/**
 * Where the Transcribe button posts, or `null` without a recording id or a
 * locale — `transcriptUrl`'s own docblock carries why both are required.
 *
 * `language` is a file's spoken language, corrected by an editor (#1016); a
 * meditation's is its own `locale`, so it never sends one.
 */
export const transcribeUrl = (
  recordingId: number | string | undefined,
  locale: string | undefined,
  relationTo: RecordingCollection = 'meditations',
  language?: string,
): string | null =>
  recordingId && locale
    ? `/api/${relationTo}/${recordingId}/transcribe${qs.stringify(
        language ? { language, locale } : { locale },
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

/**
 * The second a phrase plays from on the live preview, which takes and reports
 * whole seconds only.
 */
export const seekSecond = (timeMs: number): number => Math.floor(timeMs / 1000)

/** The second a phrase plays from on a media element, which seeks to the millisecond. */
export const exactSecond = (timeMs: number): number => timeMs / 1000

/**
 * How far before a phrase's start the playhead may read and still be inside
 * it: a media element seeked to a phrase can report a hair less than the time
 * it was given. Below one second, so whole-second playheads compare unchanged.
 */
const SEEK_TOLERANCE_SECONDS = 0.05

/**
 * The phrase being spoken at `playheadSeconds`, or `-1` in a pause.
 *
 * A phrase counts from the second a click on it seeks to (`startOf`), so it
 * lights up at once rather than a moment later — on the live preview that is
 * the whole second it starts in.
 */
export function activeSegmentIndex(
  segments: TranscriptSegment[],
  playheadSeconds: number,
  startOf: (timeMs: number) => number = seekSecond,
): number {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index]
    if (startOf(segment.startTimeMs) <= playheadSeconds + SEEK_TOLERANCE_SECONDS) {
      return playheadSeconds < segment.endTimeMs / 1000 + HIGHLIGHT_GRACE_SECONDS ? index : -1
    }
  }
  return -1
}
