'use client'

import { SelectInput } from '@payloadcms/ui'
import React, { memo } from 'react'

import { isValidLocale, type LocaleCode, LOCALES } from '@/lib/locales'

const OPTIONS = LOCALES.map(({ code, label }) => ({ label, value: code }))

/**
 * A file's spoken language, and the way to correct it (#1016).
 *
 * A file has no language of its own, so its first run detects one. Picking
 * another asks for a run in that language — `POST /api/files/:id/transcribe`
 * lets a changed language past the bounds a plain retry meets — and the new
 * transcript then serves every Path Step and language using the file.
 *
 * Memoized, so the playhead moving through the transcript beside it does not
 * re-render the select.
 */
export const SpokenLanguage = memo(function SpokenLanguage({
  language,
  request,
  requesting,
}: {
  language: string | null | undefined
  request: (language: LocaleCode) => Promise<void>
  requesting: boolean
}) {
  return (
    <SelectInput
      description="Detected from the recording. If it is wrong, choose the right one and the recording is transcribed again, for every page that uses this file."
      label="Spoken language"
      name="spokenLanguage"
      onChange={(option) => {
        const next = (option as { value?: unknown } | null)?.value
        if (typeof next === 'string' && isValidLocale(next) && next !== language) {
          void request(next)
        }
      }}
      options={OPTIONS}
      path="spokenLanguage"
      readOnly={requesting}
      value={language ?? ''}
    />
  )
})
