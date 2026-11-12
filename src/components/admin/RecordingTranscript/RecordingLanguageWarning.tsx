'use client'

import { useField, useFieldPath, useLocale } from '@payloadcms/ui'
import React from 'react'

import { InfoBanner } from '@/components/admin/InfoBanner'
import { getLocaleLabel, type LocaleCode } from '@/lib/locales'
import { transcriptSpeaksLocale } from '@/lib/transcripts/language'
import { relationId } from '@/lib/utilities/relationId'

import { spokenLanguageOf } from './transcriptModel'
import { useRecordingTranscript } from './useRecordingTranscript'

/**
 * Above an upload field narrated per language — a Path Step's intro audio — a
 * warning when the file it holds is spoken in another language than the one
 * being edited. Silent while the file states none: it is detected by the run,
 * and arrives on the transcript read this shares with the field's own panel.
 *
 * An editor cannot correct the file's language — only an admin edits a file
 * after upload (`Files.ts`) — so the warning says what an editor can do.
 */
export function RecordingLanguageWarning() {
  const path = useFieldPath()
  const { value } = useField<unknown>({ path })
  const { code } = useLocale()
  const { row } = useRecordingTranscript('files', relationId(value) ?? undefined)
  const language = spokenLanguageOf(row)

  // The rule Launch Readiness reads too, so the two cannot disagree.
  if (!language || transcriptSpeaksLocale(language, code)) return null
  const spoken = getLocaleLabel(language as LocaleCode)
  const editing = getLocaleLabel(code as LocaleCode)

  return (
    <InfoBanner title="Incorrect audio language" type="warning">
      {`This recording is in ${spoken}, but you are editing ${editing}. Choose a recording in ${editing}, or ask an admin to correct the file's spoken language if it is wrong.`}
    </InfoBanner>
  )
}

export default RecordingLanguageWarning
