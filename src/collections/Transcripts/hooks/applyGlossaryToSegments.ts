import type { CollectionBeforeChangeHook } from 'payload'

import { recordingLanguage } from '@/lib/transcripts/read'
import type { TranscriptSegment } from '@/lib/transcripts/schema'

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
