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

import { refusalMessage } from '@/components/admin/helpers/payloadListFetcher'
import { relationId } from '@/lib/utilities/relationId'
import type { Subtitles } from '@/lib/utilities/subtitles'

import { introSubtitlesUrl } from './introSubtitlesModel'

type Props = {
  /** Name of the sibling upload field that holds the recording. */
  sourceField: string
}

type Run =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; lines: number; previous: Subtitles | null; reused: boolean }
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

  const audioId = relationId(audio)
  // Off the form value, not a read of its own: the edit view populates an
  // upload field, so the filename is already here — and Payload's own upload
  // card is rendering it directly above this control. A bare id (no
  // population) falls through to the generic wording below.
  const filename = audioFilename(audio)
  const hasSubtitles = Array.isArray(subtitles) && subtitles.length > 0
  // shortcut: an unsaved swap only — form state against the saved value, so a
  // recording replaced and saved without re-running shows no warning on the
  // next visit. Upgrade when the cues carry the file they came from, the way
  // `transcripts.audioFilename` does for a meditation.
  const audioChanged = audioId !== relationId(savedAudio)

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
    const previous = subtitles ?? null
    setRun({ status: 'running' })

    try {
      const response = await fetch(url, {
        credentials: 'include',
        method: 'POST',
        signal: controller.signal,
      })
      const body: unknown = await response.json().catch(() => null)
      const { cues, reused } = (body ?? {}) as { cues?: Subtitles; reused?: boolean }

      if (controller.signal.aborted) return
      if (!response.ok || !cues) {
        // The endpoint's own sentence, where it sent one: it says which
        // recording is wrong and whether retrying can help, and a status code
        // alone names the wrong layer.
        setRun({ status: 'error', message: refusalMessage(body) ?? FAILED })
        return
      }
      setValue(cues)
      setRun({ status: 'done', lines: cues.length, previous, reused: reused === true })
    } catch {
      // A `fetch` abandoned through this controller leaves the signal aborted,
      // so this covers the `AbortError` throw as well as the latch's own abort.
      if (controller.signal.aborted) return
      setRun({ status: 'error', message: FAILED })
    } finally {
      if (inFlight.current === controller) inFlight.current = null
    }
  }, [audioId, locale, setValue, subtitles])

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
    // ⚠ **`audioChanged`, not "the locale held still".** Only a recording
    // attached in this session starts a run by itself — a run costs money, so
    // nothing but a person's own edit may buy one. Reading the previous render
    // instead is not the same test, and a locale switch is where they part:
    // Payload changes `useLocale()` first and replaces the form state in a
    // later commit (`initialState` is gated on `localeIsLoading`), so the new
    // locale's own recording arrives as an audio change with the locale
    // already settled — and a step with audio and no cues, which is the normal
    // state in 18 locales, would transcribe itself on a language switch.
    if (audioChanged && audioId && !hasSubtitles) void transcribe()
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
        <Banner type={run.reused ? 'info' : 'success'}>
          {/* ⚠ One cue row per recording, so a second ask answers with the
              first run's cues rather than making new ones — and reporting
              "Made N lines" for that would claim work the server declined.
              The modal above offers a replace, so this is where that offer is
              kept honest. */}
          {run.reused
            ? `These are the ${run.lines} subtitle lines already made for `
            : `Made ${run.lines} subtitle lines from `}
          {recording}
          {run.reused
            ? '. Making them again would answer with these same lines. Edit the words below, then save.'
            : '. Check the words below, fix any mistakes, then save.'}{' '}
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

      {run.status === 'idle' &&
        (hasSubtitles && audioChanged ? (
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
        ) : (
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
        ))}

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

/**
 * An upload field's filename, when the form value arrived populated.
 *
 * `null` for a bare id, which is what a form state built at `depth: 0` holds —
 * the caller falls back to generic wording rather than reading the row.
 */
function audioFilename(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('filename' in value)) return null
  const { filename } = value as { filename: unknown }
  return typeof filename === 'string' && filename ? filename : null
}

export default IntroSubtitles
