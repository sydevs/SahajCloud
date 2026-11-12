'use client'

import type { UIFieldClientComponent } from 'payload'

import { SelectInput, useDocumentInfo } from '@payloadcms/ui'
import React from 'react'

import { isValidLocale, LOCALES } from '@/lib/locales'
import { transcribableMedia } from '@/lib/transcripts/media'

import { useRecordingTranscript } from './useRecordingTranscript'

const OPTIONS = LOCALES.map(({ code, label }) => ({ label, value: code }))

/**
 * A file's spoken language, and the way to correct it (#1016), as a `ui` field
 * on the file's own page, above its Transcript.
 *
 * A file has no language of its own, so its first run detects one. Picking
 * another asks for a run in that language — `POST /api/files/:id/transcribe`
 * lets a changed language past the bounds a plain retry meets — and the new
 * transcript then serves every Path Step and language using the file. It reads
 * the same transcript query as the panel below, which SWR answers once for
 * both, so a correction re-reads the panel too.
 *
 * Nothing renders until a run has answered: before then there is no language
 * to correct.
 */
export const SpokenLanguageField: UIFieldClientComponent = ({ path }) => {
  const { data, id } = useDocumentInfo()
  const media = id ? transcribableMedia(data?.mimeType) : null
  const { phase, request, requesting, row } = useRecordingTranscript(
    'files',
    media ? id : undefined,
  )
  if (!media || !row || phase === 'pending') return null
  const language = row.language

  return (
    <div style={{ marginBottom: 'var(--spacing-field)' }}>
      <SelectInput
        description="Detected from the recording. If it is wrong, choose the right one and the recording is transcribed again, for every page that uses this file."
        label="Spoken language"
        name={path}
        onChange={(option) => {
          const next = (option as { value?: unknown } | null)?.value
          if (typeof next === 'string' && isValidLocale(next) && next !== language) {
            void request(next)
          }
        }}
        options={OPTIONS}
        path={path}
        readOnly={requesting}
        value={language ?? ''}
      />
    </div>
  )
}

export default SpokenLanguageField
