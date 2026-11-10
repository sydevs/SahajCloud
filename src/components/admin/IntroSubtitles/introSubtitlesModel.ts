import * as qs from 'qs-esm'

/**
 * Where the intro-subtitles control posts, or `null` without a file id or a
 * locale.
 *
 * A manager's roles are per locale, so the request must name the active admin
 * locale — one naming none resolves to the default locale and 403s a manager
 * whose roles live only elsewhere (#701). `useLocale()`'s context default is
 * `{}`, so `code` can be undefined at runtime, and `?locale=undefined` is
 * rewritten to the default locale, reproducing that bug invisibly. So this
 * refuses to build a URL instead, and the caller reports it.
 *
 * The locale also decides which language the cues are transcribed in and
 * recorded as, so sending the wrong one is worse here than a refusal.
 */
export const introSubtitlesUrl = (
  fileId: number | string | undefined | null,
  locale: string | undefined,
): string | null =>
  fileId && locale
    ? `/api/files/${fileId}/subtitles${qs.stringify({ locale }, { addQueryPrefix: true })}`
    : null

/**
 * The recording's filename, for the sentence that names it. Carries the locale
 * for the same reason as above: `files` is readable project-wide, but a read
 * naming no locale is read under a role scope the manager may not hold.
 */
export const introAudioFilenameUrl = (
  fileId: number | string | undefined | null,
  locale: string | undefined,
): string | null =>
  fileId && locale
    ? `/api/files/${fileId}${qs.stringify(
        { depth: 0, locale, select: { filename: true } },
        { addQueryPrefix: true },
      )}`
    : null

/** An upload field's form value is the file id, or the file doc when populated. */
export function uploadFileId(value: unknown): number | string | null {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) {
    const { id } = value as { id: unknown }
    if (typeof id === 'number' || typeof id === 'string') return id
  }
  return null
}
