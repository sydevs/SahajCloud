'use client'

import type { RecordingTranscriptState } from './useRecordingTranscript'

import { Button, useAuth, useLocale } from '@payloadcms/ui'
import React from 'react'

import { retranscribeWaitLabel } from '@/lib/meditations/transcriptBounds'

import { mayTranscribeLocale } from './transcriptModel'
import { useRetryCooldown } from './useTranscriptPhase'

/**
 * Ask for a recording to be transcribed again, from inside the notice that
 * says why it needs asking for.
 *
 * Whether the phase allows it at all is the caller's question, answered by
 * `transcriptPhaseIsRetryable`. What this adds is the refusals a phase cannot
 * state, each rendered rather than offered-and-refused, because a button that
 * can only answer 403, 409 or 429 is a promise the server will not keep:
 *
 * - **No recording** hides it, in every phase, as the endpoint refuses it in
 *   every phase. ⚠ The caller passes the **stored** filename: `<Upload>` writes
 *   only the `file` path, so neither staging nor removing one moves it until
 *   the save — the safe order, since the endpoint reads the stored document.
 * - **A meditation in another language** hides it, because the endpoint
 *   refuses a non-admin manager outside the language they are editing in
 *   (`mayTranscribeLocale`).
 * - **The cooldown** becomes a sentence naming the wait.
 */
export const RetryTranscript: React.FC<{
  label: string
  transcript: RecordingTranscriptState
  filename: string | null | undefined
  /** The recording's own language: a meditation's `locale`. A file has none. */
  recordingLocale?: unknown
}> = ({ label, transcript, filename, recordingLocale }) => {
  const { code: locale } = useLocale()
  const { user } = useAuth()
  const cooldownMs = useRetryCooldown(transcript.row?.createdAt)

  if (!filename) return null
  if (!mayTranscribeLocale(user, locale, recordingLocale)) return null
  if (cooldownMs > 0) {
    return <span>You can ask for it again in {retranscribeWaitLabel(cooldownMs)}.</span>
  }

  return (
    <Button
      buttonStyle="secondary"
      disabled={transcript.requesting}
      margin={false}
      onClick={() => void transcript.request()}
      size="small"
    >
      {transcript.requesting ? 'Asking…' : label}
    </Button>
  )
}
