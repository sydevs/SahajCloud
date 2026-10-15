import type { CollectionBeforeChangeHook } from 'payload'

import type { LocaleCode } from '@/lib/locales'
import type { TranscriptSegment } from '@/lib/meditations/transcript'

import { applyGlossary } from '../glossary'

/**
 * Correct every stored phrase on the way into the column.
 *
 * On the hook, not each writer: there are two writers today, and a third would
 * have to remember the call.
 *
 * Returns `data` untouched when nothing changed, which is every write in the
 * 18 locales the list has no entry for.
 */
export const applyGlossaryToSegments: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const incoming = data.segments
  if (!Array.isArray(incoming)) return data

  // A partial update touching only `segments` carries no language of its own.
  const language = (data.language ?? originalDoc?.language) as LocaleCode | null | undefined
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
