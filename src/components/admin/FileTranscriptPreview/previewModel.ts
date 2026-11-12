import * as qs from 'qs-esm'

/**
 * The file read the panel makes, or `null` without a file id or a locale —
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
          select: { filename: true, mimeType: true, mp4Url: true, url: true },
          where: { id: { equals: fileId } },
        },
        { addQueryPrefix: true },
      )}`
    : null
