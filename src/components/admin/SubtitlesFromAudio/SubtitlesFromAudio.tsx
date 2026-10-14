'use client'

import {
  Banner,
  Button,
  ConfirmationModal,
  Spinner,
  useConfig,
  useDocumentInfo,
  useField,
  useFieldPath,
  useModal,
} from '@payloadcms/ui'
import { Captions, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { Subtitles } from '@/lib/utilities/subtitles'

import { MOCK_ERROR, type MockState, mockState, mockTranscribe } from './mockTranscribe'

type Props = {
  /** Name of the sibling upload field that holds the recording. */
  sourceField: string
}

type Run =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; lines: number; previous: Subtitles | null }
  | { status: 'error'; message: string }

const REPLACE_MODAL = 'subtitles-from-audio-replace'

/**
 * Fills a subtitles JSON field from the recording in a sibling upload field
 * (`beforeInput`). The result lands in the form unsaved, so the editor checks
 * the words in the JSON editor below and saves as usual.
 *
 * Starts by itself when a recording is attached and the field is empty. It
 * never overwrites existing subtitles without a confirmation, because those may
 * hold hand corrections.
 */
export function SubtitlesFromAudio({ sourceField }: Props) {
  const path = useFieldPath()
  const sourcePath = path.includes('.')
    ? `${path.slice(0, path.lastIndexOf('.'))}.${sourceField}`
    : sourceField

  const { value: subtitles, setValue } = useField<Subtitles | null>({ path })
  const { value: audio, initialValue: savedAudio } = useField<unknown>({ path: sourcePath })
  const { hasSavePermission } = useDocumentInfo()
  const { openModal } = useModal()
  const filename = useFilename(fileId(audio))

  const [run, setRun] = useState<Run>({ status: 'idle' })
  const audioId = fileId(audio)
  const hasSubtitles = Array.isArray(subtitles) && subtitles.length > 0

  // PROTOTYPE ONLY: `?mockState=` opens the field in one state (see mockTranscribe).
  // Read after mount, because the server render has no URL to read.
  const [forced, setForced] = useState<MockState | null>(null)

  const audioChanged = forced === 'audio-changed' || audioId !== fileId(savedAudio)

  const transcribe = async () => {
    if (!audioId) return
    const previous = hasSubtitles ? subtitles : null
    setRun({ status: 'running' })
    try {
      const result = await mockTranscribe(audioId)
      setValue(result)
      setRun({ status: 'done', lines: result.length, previous })
    } catch (error) {
      setRun({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  // PROTOTYPE ONLY: apply the forced state once mounted.
  useEffect(() => {
    const state = mockState()
    setForced(state)
    if (state === 'making') setRun({ status: 'running' })
    if (state === 'failed') setRun({ status: 'error', message: MOCK_ERROR })
    // Through the real path: a value set before the JSON editor loads never reaches it.
    if (state === 'made') void transcribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, [])

  // Auto-start only on a change made in this session, so opening a step that
  // has audio but no subtitles never spends a transcription by itself.
  const lastAudio = useRef(audioId)
  useEffect(() => {
    if (audioId === lastAudio.current) return
    lastAudio.current = audioId
    setRun({ status: 'idle' })
    if (audioId && !hasSubtitles) void transcribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on the audio changing only
  }, [audioId])

  if (!hasSavePermission || !audioId) return null

  const recording = filename ? <strong>{filename}</strong> : 'the intro audio'

  return (
    <div style={{ marginBottom: 'calc(var(--base) * 0.5)' }}>
      {run.status === 'running' && (
        <Banner alignIcon="left" icon={<Spinner loadingText={null} size="sm" />} type="info">
          Making subtitles from {recording}. This takes about a minute. Keep this page open.
        </Banner>
      )}

      {run.status === 'error' && (
        <Banner type="error">
          Could not make subtitles: {run.message}{' '}
          <Button buttonStyle="secondary" margin={false} onClick={transcribe} size="small">
            Try again
          </Button>
        </Banner>
      )}

      {run.status === 'done' && (
        <Banner type="success">
          Made {run.lines} subtitle lines from {recording}. Check the words below, fix any mistakes,
          then save.{' '}
          <Button
            buttonStyle="subtle"
            icon={<Undo2 size={14} />}
            iconPosition="left"
            margin={false}
            onClick={() => {
              setValue(run.previous)
              setRun({ status: 'idle' })
            }}
            size="small"
          >
            Undo
          </Button>
        </Banner>
      )}

      {run.status === 'idle' && hasSubtitles && audioChanged && (
        <Banner type="warning">
          The intro audio changed. The subtitles below still follow the old recording.{' '}
          <Button
            buttonStyle="secondary"
            margin={false}
            onClick={() => openModal(REPLACE_MODAL)}
            size="small"
          >
            Make new subtitles
          </Button>
        </Banner>
      )}

      {run.status === 'idle' && !(hasSubtitles && audioChanged) && (
        <Button
          buttonStyle={hasSubtitles ? 'subtle' : 'secondary'}
          icon={<Captions size={16} />}
          iconPosition="left"
          margin={false}
          onClick={() => (hasSubtitles ? openModal(REPLACE_MODAL) : transcribe())}
          size="small"
        >
          {hasSubtitles ? 'Make again from audio' : 'Make subtitles from audio'}
        </Button>
      )}

      <ConfirmationModal
        body="New subtitles will replace the ones below, including any corrections made by hand. You can undo this until you save."
        confirmLabel="Replace subtitles"
        heading="Replace the subtitles?"
        modalSlug={REPLACE_MODAL}
        // Not awaited: the modal would otherwise hold "Loading…" for the whole
        // transcription and hide the progress banner.
        onConfirm={() => void transcribe()}
      />
    </div>
  )
}

/** An upload field's form value is the file id, or the file doc when populated. */
function fileId(value: unknown): number | string | null {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return (value as { id: number }).id
  return null
}

function useFilename(id: number | string | null): string | null {
  const {
    config: {
      routes: { api },
      serverURL,
    },
  } = useConfig()
  const [filename, setFilename] = useState<string | null>(null)

  useEffect(() => {
    setFilename(null)
    if (!id) return
    const controller = new AbortController()
    fetch(`${serverURL}${api}/files/${id}?depth=0&select[filename]=true`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((doc: { filename?: string } | null) => setFilename(doc?.filename ?? null))
      .catch(() => {})
    return () => controller.abort()
  }, [api, id, serverURL])

  return filename
}

export default SubtitlesFromAudio
