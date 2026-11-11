import * as qs from 'qs-esm'

import type { TranscriptSegment } from '@/lib/meditations/transcript'

/** How many lines the preview quotes before an ellipsis. */
export const PREVIEW_LINES = 3

/** The first lines of a transcript, as the preview quotes them. */
export const previewLines = (segments: readonly TranscriptSegment[]): string[] =>
  segments.slice(0, PREVIEW_LINES).map((segment) => segment.content)

/**
 * The file read the preview makes, or `null` without a file id or a locale —
 * `transcriptUrl` carries why the locale is required (#701). A list read with
 * an `id` filter rather than a document read, so a file the editor cannot
 * read answers an empty list instead of an error.
 */
export const fileUrl = (fileId: number | null, locale: string | undefined): string | null =>
  fileId && locale
    ? `/api/files${qs.stringify(
        {
          depth: 0,
          limit: 1,
          locale,
          select: { filename: true, mimeType: true },
          where: { id: { equals: fileId } },
        },
        { addQueryPrefix: true },
      )}`
    : null
