'use client'

import { Button, toast, useDocumentInfo, useLocale } from '@payloadcms/ui'
import React, { useCallback, useState } from 'react'

import { retranscribeWaitLabel } from '@/lib/meditations/transcriptBounds'

import { retryTranscriptUrl } from './transcriptModel'
import { useRetryCooldown } from './useTranscriptPhase'

const FAILED = 'Could not ask for a transcript.'

/**
 * Ask for this meditation's recording to be transcribed again, from inside the
 * notice that says why it needs asking for.
 *
 * Whether the phase allows it at all is the caller's question, answered by
 * `transcriptPhaseIsRetryable`. What this adds is the two refusals a phase
 * cannot state, and both are rendered rather than offered-and-refused, because
 * a button that can only answer 409 or 429 is a promise the server will not
 * keep:
 *
 * - **The cooldown** becomes a sentence naming the wait.
 * - **No recording** hides the control outright, in every phase, exactly as
 *   the endpoint refuses it in every phase. Read off the saved document rather
 *   than the transcript row, because the recording lives on the meditation —
 *   and off `useDocumentInfo().data` rather than form state, which is what
 *   `AudioUpload` reads on this same collection to decide whether to render a
 *   player. ⚠ Both are the stored filename: `<Upload>` writes only the `file`
 *   path, so neither staging nor removing one moves this until the save. That
 *   is the safe order, since the endpoint reads the stored document too.
 */
export const RetryTranscript: React.FC<{
  meditationId: number | string
  /** SWR's `mutate`, which re-reads the row and restarts the poll. */
  onRetried: () => void
  /** The existing row's `createdAt` — the instant of the last request. */
  requestedAt: string | undefined
}> = ({ meditationId, onRetried, requestedAt }) => {
  const { code: locale } = useLocale()
  const { data } = useDocumentInfo()
  const filename = data?.filename as string | null | undefined
  const cooldownMs = useRetryCooldown(requestedAt)
  const [busy, setBusy] = useState(false)

  const retry = useCallback(async () => {
    setBusy(true)
    try {
      // No locale, no request: one resolves the default locale server-side and
      // reproduces the #701 403 silently — see `transcriptUrl`.
      const url = retryTranscriptUrl(meditationId, locale)
      if (!url) {
        toast.error(FAILED)
        return
      }
      const response = await fetch(url, { credentials: 'include', method: 'POST' })
      const body = (await response.json().catch(() => null)) as {
        errors?: { message?: string }[]
      } | null
      if (!response.ok) {
        toast.error(body?.errors?.[0]?.message ?? FAILED)
        // ⚠ **A refusal can mean the row moved on.** A run slower than the
        // stall bound that then finishes reads `stalled` here and `completed`
        // on the server — and nothing polls a phase that offers this button,
        // so without a re-read the tab keeps a notice the server disagrees
        // with and a button that only 409s. A 429 is the one refusal that
        // leaves the row as this tab already has it.
        if (response.status !== 429) onRetried()
        return
      }
      toast.success('Transcribing the recording again.')
      // SWR's own re-read, not `router.refresh()`: this tab's state is SWR's,
      // not the route's. It renders the in-progress notice and restarts the
      // poll (`pollInterval`).
      onRetried()
    } catch {
      toast.error(FAILED)
    } finally {
      setBusy(false)
    }
  }, [locale, meditationId, onRetried])

  if (!filename) return null
  if (cooldownMs > 0) {
    return <span>You can ask for it again in {retranscribeWaitLabel(cooldownMs)}.</span>
  }

  return (
    <Button buttonStyle="secondary" disabled={busy} margin={false} onClick={retry} size="small">
      {busy ? 'Asking…' : 'Transcribe again'}
    </Button>
  )
}
