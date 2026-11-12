'use client'

import type { RecordingTranscriptState } from './useRecordingTranscript'

import { useAuth, useLocale } from '@payloadcms/ui'

import type { InfoBannerAction } from '@/components/admin/InfoBanner'
import { retranscribeWaitLabel, transcriptPhaseIsRetryable } from '@/lib/transcripts/bounds'

import { mayTranscribeLocale } from './transcriptModel'
import { useRetryCooldown } from './useTranscriptPhase'

/**
 * The Transcribe-again action for the notice that says why a transcript needs
 * asking for, or the sentence that stands in for it.
 *
 * Whether the phase allows a retry at all is `transcriptPhaseIsRetryable`'s,
 * the rule the endpoint refuses from. What this adds is the refusals a phase
 * cannot state, each rendered rather than offered-and-refused, because a button
 * that can only answer 403, 409 or 429 is a promise the server will not keep:
 *
 * - **No recording** offers nothing, in every phase, as the endpoint refuses it
 *   in every phase. ⚠ The caller passes the **stored** filename: `<Upload>`
 *   writes only the `file` path, so neither staging nor removing one moves it
 *   until the save — the safe order, since the endpoint reads the stored
 *   document.
 * - **A meditation in another language** offers nothing, because the endpoint
 *   refuses a non-admin manager outside the language they are editing in
 *   (`mayTranscribeLocale`).
 * - **The cooldown** becomes a sentence naming the wait.
 */
export function useRetryTranscript({
  transcript,
  filename,
  recordingLocale,
}: {
  transcript: RecordingTranscriptState
  filename: string | null | undefined
  /** The recording's own language: a meditation's `locale`. A file has none. */
  recordingLocale?: unknown
}): { action?: InfoBannerAction; wait?: string } {
  const { code: locale } = useLocale()
  const { user } = useAuth()
  const { phase, request, requesting, row } = transcript
  const cooldownMs = useRetryCooldown(row?.createdAt)

  if (!transcriptPhaseIsRetryable(phase) || !filename) return {}
  if (!mayTranscribeLocale(user, locale, recordingLocale)) return {}
  if (cooldownMs > 0) return { wait: retranscribeWaitLabel(cooldownMs) }

  const label = phase === 'none' ? 'Transcribe' : 'Transcribe again'
  return {
    action: {
      disabled: requesting,
      label: requesting ? 'Asking…' : label,
      onClick: () => void request(),
    },
  }
}
