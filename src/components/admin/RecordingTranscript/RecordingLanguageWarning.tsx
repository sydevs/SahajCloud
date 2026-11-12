'use client'

import { useField, useFieldPath, useLocale } from '@payloadcms/ui'
import React from 'react'

import { InfoBanner } from '@/components/admin/InfoBanner'
import { getLocaleLabel, type LocaleCode } from '@/lib/locales'
import { transcriptSpeaksLocale } from '@/lib/transcripts/language'
import { relationId } from '@/lib/utilities/relationId'

import { useRecordingTranscript } from './useRecordingTranscript'

/**
 * Above an upload field narrated per language — a Path Step's intro audio — a
 * warning when the recording it holds was transcribed in another language than
 * the one being edited. Silent until a run has named one: the language is
 * detected, so a file still waiting on its first run has none to compare.
 *
 * Reads the same transcript query the field's own panel does, which SWR
 * answers once for both, and the language rule `intro-subtitles-set` reads
 * (`transcriptSpeaksLocale`).
 */
export function RecordingLanguageWarning() {
  const path = useFieldPath()
  const { value } = useField<unknown>({ path })
  const { code } = useLocale()
  const { phase, row } = useRecordingTranscript('files', relationId(value) ?? undefined)

  // The rule Launch Readiness reads too, so the two cannot disagree.
  if (phase !== 'completed' || transcriptSpeaksLocale(row?.language, code)) return null
  const language = row?.language as LocaleCode
  const editing = code as LocaleCode

  return (
    <InfoBanner title="Incorrect audio language" type="warning">
      This recording is in {getLocaleLabel(language)}, but you are editing {getLocaleLabel(editing)}
      .
    </InfoBanner>
  )
}

export default RecordingLanguageWarning
