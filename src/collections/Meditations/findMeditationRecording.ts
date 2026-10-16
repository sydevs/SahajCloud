import type { PayloadRequest } from 'payload'

import type { LocaleCode } from '@/lib/locales'

/**
 * The meditation's current recording and locale, or `null` when there is no
 * such meditation.
 *
 * Reads the latest draft: the editor hears and places frames against the
 * draft's audio, so that is the recording a transcript must match. `locale` is
 * what a transcription request stores as the row's `language`.
 *
 * Here rather than beside the transcripts collection, because it reads *this*
 * collection's document — its four consumers are the two transcript endpoints,
 * the transcription task and nothing else (`src/AGENTS.md` rule 4).
 */
export async function findMeditationRecording(
  req: PayloadRequest,
  meditationId: number,
): Promise<{ filename: string | null; locale: LocaleCode } | null> {
  const meditation = await req.payload.findByID({
    collection: 'meditations',
    id: meditationId,
    depth: 0,
    draft: true,
    select: { filename: true, locale: true },
    overrideAccess: true,
    disableErrors: true,
    req,
  })
  if (!meditation) return null
  return { filename: meditation.filename ?? null, locale: meditation.locale as LocaleCode }
}
