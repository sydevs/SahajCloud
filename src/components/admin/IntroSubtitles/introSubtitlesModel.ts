import * as qs from 'qs-esm'

/**
 * Where the intro-subtitles control posts, or `null` without a file id or a
 * locale.
 *
 * `MeditationTranscript/transcriptModel.ts` carries why a hand-rolled admin
 * request must name the locale, and why refusing to build the URL beats
 * sending none (#701).
 *
 * One reason more here: the locale also decides which language the cues are
 * transcribed in and recorded as, so sending the wrong one writes real words
 * into the wrong field rather than merely answering 403.
 */
export const introSubtitlesUrl = (
  fileId: number | string | undefined | null,
  locale: string | undefined,
): string | null =>
  fileId && locale
    ? `/api/files/${fileId}/subtitles${qs.stringify({ locale }, { addQueryPrefix: true })}`
    : null
