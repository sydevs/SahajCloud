'use client'

import { useField, useFieldPath, useLocale } from '@payloadcms/ui'
import React from 'react'
import useSWR from 'swr'

import { type PayloadList, payloadListFetcher } from '@/components/admin/helpers/payloadListFetcher'
import { FileRecordingTranscript } from '@/components/admin/RecordingTranscript'
import { transcribableMedia } from '@/lib/transcripts/media'
import { relationId } from '@/lib/utilities/relationId'
import type { File } from '@/payload-types'

import { fileUrl } from './previewModel'

type Props = {
  /** Name of the sibling upload field that holds the file. */
  sourceField: string
  label: string
  /** Warn when the recording's language is not the one being edited. */
  checkLanguage?: boolean
}

const firstDoc = <T,>(list: PayloadList<T> | undefined): T | undefined => list?.docs?.[0]

/**
 * The subtitles a Path Step gets from a file it uses (#1016): the file's own
 * transcript and player, the same panel the file's page shows, under the upload
 * field it follows. Never stored on the step, so a re-run or a corrected
 * language here serves every step using the file.
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

  const { data } = useSWR(fileUrl(fileId, code), payloadListFetcher<File>, {
    revalidateOnFocus: false,
  })
  const file = firstDoc(data)

  if (!fileId || !file || transcribableMedia(file.mimeType) === null) return null

  // Keyed, so a swapped file starts its player and playhead afresh.
  return (
    <FileRecordingTranscript
      checkLanguage={checkLanguage}
      file={file}
      key={file.id}
      label={label}
      path={path}
    />
  )
}

export default FileTranscriptPreview
