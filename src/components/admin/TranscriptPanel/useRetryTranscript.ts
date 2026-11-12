'use client'

import type { TranscriptState } from './useTranscript'

import { toast, useAuth, useLocale } from '@payloadcms/ui'
import { useState } from 'react'

import { refusalMessage } from '@/components/admin/helpers/payloadListFetcher'
import type { InfoBannerAction } from '@/components/admin/InfoBanner'
import { retranscribeWaitLabel, transcriptPhaseIsRetryable } from '@/lib/transcripts/bounds'

import { mayTranscribeLocale } from './transcriptModel'
import { useRetryCooldown } from './useTranscriptPhase'

const REQUEST_FAILED = 'Could not ask for a transcript.'

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
 *
 * The click posts the request and re-reads the row, which restarts the poll.
 */
export function useRetryTranscript({
  transcript,
  filename,
  recordingLocale,
}: {
  transcript: TranscriptState
  filename: string | null | undefined
  /** The recording's own language: a meditation's `locale`. A file has none. */
  recordingLocale?: unknown
}): { action?: InfoBannerAction; wait?: string } {
  const { code: locale } = useLocale()
  const { user } = useAuth()
  const { phase, reread, row, transcribeUrl } = transcript
  const cooldownMs = useRetryCooldown(row?.createdAt)
  const [requesting, setRequesting] = useState(false)

  if (!transcriptPhaseIsRetryable(phase) || !filename) return {}
  if (!mayTranscribeLocale(user, locale, recordingLocale)) return {}
  if (cooldownMs > 0) return { wait: retranscribeWaitLabel(cooldownMs) }

  const request = async () => {
    // No locale, no request: one resolves the default locale server-side and
    // reproduces the #701 403 silently — see `transcriptUrl`.
    if (!transcribeUrl) {
      toast.error(REQUEST_FAILED)
      return
    }
    setRequesting(true)
    try {
      const response = await fetch(transcribeUrl, { credentials: 'include', method: 'POST' })
      const body: unknown = await response.json().catch(() => null)
      if (response.ok) {
        toast.success('Transcribing the recording again.')
      } else {
        toast.error(refusalMessage(body) ?? REQUEST_FAILED)
        // ⚠ **A refusal can mean the row moved on.** A run slower than the
        // stall bound that then finishes reads `stalled` here and `completed`
        // on the server — and nothing polls a phase that offers a retry, so
        // without a re-read the panel keeps a notice the server disagrees
        // with. A 429 is the one refusal that leaves the row as it is here.
        if (response.status === 429) return
      }
      reread()
    } catch {
      toast.error(REQUEST_FAILED)
    } finally {
      setRequesting(false)
    }
  }

  const label = phase === 'none' ? 'Transcribe' : 'Transcribe again'
  return {
    action: {
      disabled: requesting,
      label: requesting ? 'Asking…' : label,
      onClick: () => void request(),
    },
  }
}
