'use client'

import { SelectInput, toast, useLocale } from '@payloadcms/ui'
import React, { useCallback, useState } from 'react'

import { refusalMessage } from '@/components/admin/helpers/payloadListFetcher'
import { getLocaleLabel, LOCALES, type LocaleCode } from '@/lib/locales'

import { transcribeUrl } from './transcriptModel'

const OPTIONS = LOCALES.map(({ code, label }) => ({ label, value: code }))

const FAILED = 'Could not change the language.'

/**
 * A file's spoken language, and the way to correct it (#1016).
 *
 * A file has no language of its own, so its first run detects one. Picking
 * another asks for a run in that language — `POST /api/files/:id/transcribe`
 * lets a changed language past the bounds a plain retry meets — and the new
 * transcript then serves every Path Step and language using the file.
 */
export const SpokenLanguage: React.FC<{
  fileId: number | string
  language: string | null | undefined
  /** SWR's `mutate`, which re-reads the row and restarts the poll. */
  onChanged: () => void
}> = ({ fileId, language, onChanged }) => {
  const { code: locale } = useLocale()
  const [busy, setBusy] = useState(false)

  const change = useCallback(
    async (next: LocaleCode) => {
      const url = transcribeUrl(fileId, locale, 'files', next)
      if (!url) {
        toast.error(FAILED)
        return
      }
      setBusy(true)
      try {
        const response = await fetch(url, { credentials: 'include', method: 'POST' })
        const body: unknown = await response.json().catch(() => null)
        if (!response.ok) {
          toast.error(refusalMessage(body) ?? FAILED)
          return
        }
        toast.success(`Transcribing the recording again, in ${getLocaleLabel(next)}.`)
        onChanged()
      } catch {
        toast.error(FAILED)
      } finally {
        setBusy(false)
      }
    },
    [fileId, locale, onChanged],
  )

  return (
    <SelectInput
      description="Detected from the recording. If it is wrong, choose the right one and the recording is transcribed again, for every page that uses this file."
      label="Spoken language"
      name="spokenLanguage"
      onChange={(option) => {
        const next = (option as { value?: string } | null)?.value
        const chosen = OPTIONS.find((entry) => entry.value === next)?.value
        if (chosen && chosen !== language) void change(chosen)
      }}
      options={OPTIONS}
      path="spokenLanguage"
      readOnly={busy}
      value={language ?? ''}
    />
  )
}
