import { baseLanguage, isValidLocale } from '@/lib/locales'

/**
 * Whether a transcript's language is the one a reader is working in.
 *
 * One rule for the editor's warning and for launch readiness: a transcript in
 * another language is the thing `FileTranscriptPreview` warns about, so the
 * readiness report cannot call that locale done (#1016).
 *
 * Compared on the base subtag, because an intro narrated in `pt` serves `pt-BR`.
 * An unknown language on either side answers `true`: detection found nothing to
 * disagree with, and a guess is not a mismatch.
 */
export function transcriptSpeaksLocale(
  language: string | null | undefined,
  locale: string | null | undefined,
): boolean {
  if (!language || !isValidLocale(language)) return true
  if (!locale || !isValidLocale(locale)) return true
  return baseLanguage(language) === baseLanguage(locale)
}
