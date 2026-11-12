'use client'

import type { UploadFieldDescriptionClientComponent } from 'payload'

import { FieldDescription, useField, useFieldPath, useLocale } from '@payloadcms/ui'
import React from 'react'
import useSWR from 'swr'

import { type PayloadList, payloadListFetcher } from '@/components/admin/helpers/payloadListFetcher'
import {
  FileRecordingTranscript,
  type TranscribedFile,
} from '@/components/admin/RecordingTranscript'
import { useRecordingTranscript } from '@/components/admin/RecordingTranscript/useRecordingTranscript'
import { transcribableMedia } from '@/lib/transcripts/media'
import { relationId } from '@/lib/utilities/relationId'
import type { File } from '@/payload-types'

import { fileUrl } from './fileModel'

const firstDoc = <T,>(list: PayloadList<T> | undefined): T | undefined => list?.docs?.[0]

/**
 * An upload field's description, followed by the transcript of the file it
 * holds (#1016): a Path Step's intro audio and panel videos. Registered as the
 * field's `Description` because that is the one slot Payload renders after the
 * description — `afterInput` sits above it — so the transcript reads as part
 * of the field rather than as a field of its own.
 *
 * Read-only, and never stored on the step: the transcript is the file's, and a
 * retry here serves every step using it. Its language is corrected on the file.
 */
export const UploadTranscript: UploadFieldDescriptionClientComponent = ({ field, path }) => {
  const fieldPath = useFieldPath() || path
  const { value } = useField<unknown>({ path: fieldPath })
  const fileId = relationId(value)
  const { code } = useLocale()

  const { data } = useSWR(fileUrl(fileId, code), payloadListFetcher<File>, {
    revalidateOnFocus: false,
  })
  const file = firstDoc(data)
  const transcribable = file ? transcribableMedia(file.mimeType) !== null : false

  return (
    <>
      <FieldDescription description={field?.admin?.description} path={fieldPath} />
      {file && transcribable && (
        // Keyed, so a swapped file starts its player and playhead afresh.
        <FileTranscriptBody file={file} key={file.id} />
      )}
    </>
  )
}

function FileTranscriptBody({ file }: { file: TranscribedFile }) {
  const transcript = useRecordingTranscript('files', file.id)
  return (
    <div style={{ marginTop: 'calc(var(--base) * 0.75)' }}>
      <FileRecordingTranscript collapsible file={file} transcript={transcript} />
    </div>
  )
}

export default UploadTranscript
