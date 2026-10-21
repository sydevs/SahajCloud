import { TRANSCRIPTION_STALL_MS } from '@/lib/meditations/transcriptStall'
import type { MeditationTranscript } from '@/payload-types'

export type TranscriptPhase = 'none' | 'pending' | 'stalled' | 'failed' | 'completed'

/**
 * How far a meditation's transcript has got: which notice the Transcript tab
 * shows, and which answer `POST /api/meditations/:id/transcript` gives. No row
 * means never transcribed: a replaced recording takes its row with it and a
 * fresh one is queued at once, so there is no out-of-date transcript to keep on
 * screen.
 *
 * `TRANSCRIPTION_STALL_MS` is the bound the collection already passes
 * `jobStage.staleAfterMs`, so the tab and the row's own Edit view go stale
 * together. An unparseable `updatedAt` keeps the wait, as it does there.
 *
 * ⚠ **One definition for the control and the refusal** (#984). The endpoint
 * decides eligibility from this function and the tab offers the button from it,
 * so a button cannot promise a retry the server refuses. Zod-free and apart
 * from `./transcript`, for the reason `transcriptStall.ts` states: the tab is a
 * `'use client'` component.
 */
export function transcriptPhase(
  row: Pick<MeditationTranscript, 'status' | 'updatedAt'> | undefined,
  now: number = Date.now(),
): TranscriptPhase {
  if (!row) return 'none'
  if (row.status === 'failed') return 'failed'
  if (row.status === 'processing') {
    return now - Date.parse(row.updatedAt) > TRANSCRIPTION_STALL_MS ? 'stalled' : 'pending'
  }
  return 'completed'
}

/**
 * Whether a transcript in this phase may be asked for again.
 *
 * `completed` has a transcript to read, and replacing the recording is how that
 * one is redone; `pending` has a run in flight. Everything else is a failure, a
 * run nothing will finish, or a request that never landed.
 */
export const transcriptPhaseIsRetryable = (phase: TranscriptPhase): boolean =>
  phase === 'failed' || phase === 'stalled' || phase === 'none'
