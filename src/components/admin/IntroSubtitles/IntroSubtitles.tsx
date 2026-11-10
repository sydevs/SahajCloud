'use client'

import {
  Banner,
  Button,
  ConfirmationModal,
  Spinner,
  useDocumentInfo,
  useField,
  useFieldPath,
  useLocale,
  useModal,
} from '@payloadcms/ui'
import { Captions, Undo2 } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import type { Subtitles } from '@/lib/utilities/subtitles'

import {
  introAudioFilenameUrl,
  introSubtitlesUrl,
  uploadFileId,
} from './introSubtitlesModel'

type Props = {
  /** Name of the sibling upload field that holds the recording. */
  sourceField: string
}

type Run =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; lines: number; previous: Subtitles | null }
  | { status: 'error'; message: string }

const REPLACE_MODAL = 'intro-subtitles-replace'
const FAILED = 'Could not make subtitles.'

/**
 * Fills a Path Step's intro subtitles from the recording in the sibling upload
 * field, in the language the admin is editing (`beforeInput`). The cues land in
 * the form unsaved, so the editor checks the words in the JSON editor below and
 * saves as usual.
 *
 * ⚠ **The field and the recording are both per locale, so a run belongs to one
 * language.** Every request latches the file id and the locale it started
 * under, and a resolve whose latch no longer matches the field is discarded —
 * a locale switch mid-run would otherwise write Czech cues into German.
 *
 * It starts by itself when a recording is attached in this session and the
 * field is empty, so the common path costs no click. It never replaces existing
 * cues without a confirmation: those may hold corrections typed by hand.
 */
export function IntroSubtitles({ sourceField }: Props) {
  const path = useFieldPath()
  const sourcePath = path.includes('.')
    ? `${path.slice(0, path.lastIndexOf('.'))}.${sourceField}`
    : sourceField

  const { value: subtitles, setValue } = useField<Subtitles | null>({ path })
  const { value: audio, initialValue: savedAudio } = useField<unknown>({ path: sourcePath })
  const { hasSavePermission } = useDocumentInfo()
  const { code: locale } = useLocale()
  const { openModal } = useModal()

  const audioId = uploadFileId(audio)
  const filename = useAudioFilename(audioId, locale)
  const hasSubtitles = Array.isArray(subtitles) && subtitles.length > 0
  const audioChanged = audioId !== uploadFileId(savedAudio)

  const [run, setRun] = useState<Run>({ status: 'idle' })
  // One request at a time, and the one in flight is abandoned when the field
  // moves on. `useRef` rather than state: a second press must see the flag
  // immediately, not after a render.
  const inFlight = useRef<AbortController | null>(null)

  const transcribe = useCallback(async () => {
    const url = introSubtitlesUrl(audioId, locale)
    if (!url) {
      setRun({ status: 'error', message: FAILED })
      return
    }
    if (inFlight.current) return

    const controller = new AbortController()
    inFlight.current = controller
    const previous = hasSubtitles ? subtitles : null
    setRun({ status: 'running' })

    try {
      const response = await fetch(url, {
        credentials: 'include',
        method: 'POST',
        signal: controller.signal,
      })
      const body = (await response.json().catch(() => null)) as {
        cues?: Subtitles
        errors?: { message?: string }[]
      } | null

      if (controller.signal.aborted) return
      if (!response.ok || !body?.cues) {
        setRun({ status: 'error', message: body?.errors?.[0]?.message ?? FAILED })
        return
      }
      setValue(body.cues)
      setRun({ status: 'done', lines: body.cues.length, previous })
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        return
      }
      setRun({ status: 'error', message: FAILED })
    } finally {
      if (inFlight.current === controller) inFlight.current = null
    }
  }, [audioId, hasSubtitles, locale, setValue, subtitles])

  // Abandon a run the field has moved on from, in either dimension. Resetting
  // to idle as well, because the banner above the editor would otherwise
  // report the previous language's result as this one's.
  const latch = useRef({ audioId, locale })
  useEffect(() => {
    const previous = latch.current
    if (previous.audioId === audioId && previous.locale === locale) return
    latch.current = { audioId, locale }
    inFlight.current?.abort()
    inFlight.current = null
    setRun({ status: 'idle' })
    // Only a recording attached in this session starts a run by itself, so
    // opening a step that has audio but no cues never spends one.
    if (previous.locale === locale && audioId && !hasSubtitles) void transcribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on the latch moving only
  }, [audioId, locale])

  // Abandon the run when the field goes away, rather than resolving into an
  // unmounted form.
  useEffect(() => () => inFlight.current?.abort(), [])

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
          {run.message}{' '}
          <Button
            buttonStyle="secondary"
            margin={false}
            onClick={() => void transcribe()}
            size="small"
          >
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
          onClick={() => (hasSubtitles ? openModal(REPLACE_MODAL) : void transcribe())}
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
        // run and hide the progress banner.
        onConfirm={() => void transcribe()}
      />
    </div>
  )
}

/** The recording's filename, for the sentence that names it. */
function useAudioFilename(id: number | string | null, locale: string | undefined): string | null {
  const [filename, setFilename] = useState<string | null>(null)

  useEffect(() => {
    setFilename(null)
    const url = introAudioFilenameUrl(id, locale)
    if (!url) return
    const controller = new AbortController()
    fetch(url, { credentials: 'include', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((doc: { filename?: string } | null) => setFilename(doc?.filename ?? null))
      .catch(() => {})
    return () => controller.abort()
  }, [id, locale])

  return filename
}

export default IntroSubtitles
