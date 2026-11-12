import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'

import { extractID } from 'payload/shared'

import type { LocaleCode } from '@/lib/locales'
import type { TranscriptSegment } from '@/lib/transcripts/schema'
import type { Transcript } from '@/payload-types'

import { applyGlossary } from '../glossary'

/**
 * Correct every stored phrase on the way into the column, in the language the
 * recording is spoken in.
 *
 * On the hook, not each writer: there are three writers today — the run and two
 * imports — and a fourth would have to remember the call.
 *
 * Returns `data` untouched when nothing changed, which is every write in the
 * 18 locales the list has no entry for, and every write for a recording whose
 * language nobody knows.
 */
export const applyGlossaryToSegments: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const incoming = data.segments
  if (!Array.isArray(incoming)) return data

  const language = await recordingLanguage(req, data.source ?? originalDoc?.source)
  if (!language) return data

  let corrected = false
  const segments = incoming.map((segment: TranscriptSegment) => {
    const content = applyGlossary(segment.content, language)
    if (content === segment.content) return segment
    corrected = true
    return { ...segment, content }
  })

  return corrected ? { ...data, segments } : data
}

/**
 * The language a transcript's recording states: a meditation's `locale`, a
 * file's `spokenLanguage` (#1016).
 *
 * Read with `req`, because the run writes a detected language to the file just
 * before the cues, in the same request. The meditation is read as its draft,
 * which is the recording the run transcribed.
 */
async function recordingLanguage(
  req: PayloadRequest,
  source: Transcript['source'] | undefined,
): Promise<LocaleCode | null> {
  if (!source?.value) return null
  const id = extractID(source.value)
  if (source.relationTo === 'meditations') {
    const meditation = await req.payload.findByID({
      collection: 'meditations',
      id,
      depth: 0,
      draft: true,
      disableErrors: true,
      overrideAccess: true,
      select: { locale: true },
      trash: true,
      req,
    })
    return meditation?.locale ?? null
  }
  const file = await req.payload.findByID({
    collection: 'files',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    select: { spokenLanguage: true },
    trash: true,
    req,
  })
  return file?.spokenLanguage ?? null
}
