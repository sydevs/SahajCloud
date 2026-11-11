'use client'

import {
  Button,
  FieldLabel,
  Spinner,
  useDocumentDrawer,
  useField,
  useFieldPath,
  useLocale,
} from '@payloadcms/ui'
import React, { useEffect, useRef } from 'react'
import useSWR from 'swr'

import { type PayloadList, payloadListFetcher } from '@/components/admin/helpers/payloadListFetcher'
import { InfoBanner } from '@/components/admin/InfoBanner'
import { RetryTranscript } from '@/components/admin/RecordingTranscript/RetryTranscript'
import { transcriptUrl } from '@/components/admin/RecordingTranscript/transcriptModel'
import { useTranscriptPhase } from '@/components/admin/RecordingTranscript/useTranscriptPhase'
import { baseLanguage, getLocaleLabel, isValidLocale, type LocaleCode } from '@/lib/locales'
import { transcriptPhase } from '@/lib/meditations/transcriptBounds'
import { transcribableMedia } from '@/lib/transcripts/media'
import { relationId } from '@/lib/utilities/relationId'
import type { File, Transcript } from '@/payload-types'

import { fileUrl, PREVIEW_LINES, previewLines } from './previewModel'

const POLL_INTERVAL_MS = 3000

type Props = {
  /** Name of the sibling upload field that holds the file. */
  sourceField: string
  label: string
  /**
   * Warn when the recording is in another language than the one being edited.
   * True for a step's intro audio, which is narrated per language; false for a
   * panel video, which may be shown to every language as it is.
   */
  checkLanguage?: boolean
}

const firstDoc = <T,>(list: PayloadList<T> | undefined): T | undefined => list?.docs?.[0]

/** Module scope, for the reason `RecordingTranscript`'s own poll gives. */
const pollInterval = (latest?: PayloadList<Transcript>): number =>
  transcriptPhase(firstDoc(latest)) === 'pending' ? POLL_INTERVAL_MS : 0

/**
 * The subtitles a Path Step gets from a file it uses (#1016): the file's own
 * transcript, read here and never stored on the step. Shown read-only under the
 * upload field it follows, with the way to open the file's Transcript panel —
 * where a run is retried or its language corrected, for every step using the
 * file at once.
 *
 * Renders nothing for a file with no transcript to have, such as a panel image.
 */
export function FileTranscriptPreview({ sourceField, label, checkLanguage = false }: Props) {
  const path = useFieldPath()
  const sourcePath = path.includes('.')
    ? `${path.slice(0, path.lastIndexOf('.'))}.${sourceField}`
    : sourceField
  const { value } = useField<unknown>({ path: sourcePath })
  const fileId = relationId(value)
  const { code } = useLocale()

  const { data: files } = useSWR(fileUrl(fileId, code), payloadListFetcher<File>, {
    revalidateOnFocus: false,
  })
  const file = firstDoc(files)
  const isTranscribable = transcribableMedia(file?.mimeType) !== null

  const { data, error, mutate } = useSWR(
    isTranscribable ? transcriptUrl(fileId ?? undefined, code, 'files') : null,
    payloadListFetcher<Transcript>,
    { refreshInterval: pollInterval, revalidateOnFocus: false },
  )
  const row = firstDoc(data)
  const phase = useTranscriptPhase(row)

  const [FileDrawer, , { isDrawerOpen, openDrawer }] = useDocumentDrawer({
    collectionSlug: 'files',
    id: fileId,
  })
  // A language corrected inside the drawer is a new run this panel should show.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !isDrawerOpen) void mutate()
    wasOpen.current = isDrawerOpen
  }, [isDrawerOpen, mutate])

  if (!fileId || !file || !isTranscribable) return null

  const filename = file.filename ?? 'the recording'
  const retry = (retryLabel: string) => (
    <RetryTranscript
      filename={file.filename}
      label={retryLabel}
      onRetried={mutate}
      recordingId={fileId}
      relationTo="files"
      requestedAt={row?.createdAt}
    />
  )

  let body: React.ReactNode
  if (error) {
    body = (
      <InfoBanner type="error">
        Could not load the transcript. {error instanceof Error ? error.message : ''}
      </InfoBanner>
    )
  } else if (!data) {
    body = <Spinner loadingText="Loading the transcript…" size="sm" />
  } else if (phase === 'none') {
    body = (
      <InfoBanner action={retry('Transcribe')} title="No transcript yet.">
        {filename} has not been transcribed.
      </InfoBanner>
    )
  } else if (phase === 'pending') {
    body = (
      <InfoBanner
        icon={<Spinner loadingText={null} size="sm" />}
        title={`Transcribing ${filename}…`}
      >
        This usually takes about a minute. You can keep editing and save in the meantime.
      </InfoBanner>
    )
  } else if (phase === 'failed' || phase === 'stalled') {
    body = (
      <InfoBanner
        action={retry('Transcribe again')}
        title={phase === 'failed' ? 'Transcription failed.' : 'Transcription stopped responding.'}
        type="error"
      >
        {phase === 'failed'
          ? row?.error
          : 'It has not finished, and nothing is still working on it.'}
      </InfoBanner>
    )
  } else {
    const segments = row?.segments ?? []
    const language = isValidLocale(row?.language ?? '') ? (row?.language as LocaleCode) : null
    const mismatch =
      checkLanguage &&
      language !== null &&
      isValidLocale(code ?? '') &&
      baseLanguage(language) !== baseLanguage(code as LocaleCode)
    body = (
      <>
        {mismatch && (
          <InfoBanner type="warning">
            This recording is in {getLocaleLabel(language)}, but you are editing{' '}
            {getLocaleLabel(code as LocaleCode)}.
          </InfoBanner>
        )}
        <p style={{ color: 'var(--theme-elevation-500)', margin: 0 }}>
          {segments.length} lines{language ? ` · ${getLocaleLabel(language)}` : ''}
        </p>
        <blockquote style={{ margin: 'calc(var(--base) * 0.25) 0' }}>
          {previewLines(segments).map((line, index) => (
            <div key={index}>{line}</div>
          ))}
          {segments.length > PREVIEW_LINES && <div>…</div>}
        </blockquote>
      </>
    )
  }

  return (
    <div className="field-type" style={{ marginBottom: 'var(--spacing-field)' }}>
      <FieldLabel label={label} path={path} />
      <div aria-live="polite" role="status">
        {body}
      </div>
      <Button buttonStyle="secondary" margin={false} onClick={openDrawer} size="small">
        Open transcript
      </Button>
      <FileDrawer />
    </div>
  )
}

export default FileTranscriptPreview
