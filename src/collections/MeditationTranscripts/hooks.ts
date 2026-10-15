import type { CollectionBeforeChangeHook } from 'payload'

import type { LocaleCode } from '@/lib/locales'
import type { TranscriptSegment } from '@/lib/meditations/transcript'

import { applyGlossary } from './glossary'

/**
 * Correct every stored phrase on the way into the column.
 *
 * On the hook rather than at each writer: a live transcription and the import
 * of the existing library are two writers, and a third would have to remember
 * the call. Here, no writer can store an uncorrected spelling.
 *
 * `language` can be absent from a partial update that touches only
 * `segments`, so it falls back to the row as stored.
 */
export const applyGlossaryToSegments: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const segments = data.segments
  if (!Array.isArray(segments)) return data

  const language = (data.language ?? originalDoc?.language) as LocaleCode | null | undefined
  if (!language) return data

  return {
    ...data,
    segments: segments.map((segment: TranscriptSegment) => ({
      ...segment,
      text: applyGlossary(segment.text, language),
    })),
  }
}
