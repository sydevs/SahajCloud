import type { MeditationTranscript } from '@/payload-types'

/**
 * The transcript's two time bounds, and the phase they decide.
 *
 * Deliberately apart from `./transcript`, which builds zod schemas at module
 * scope. The Transcript tab is a `'use client'` component and reads all of
 * this, so reaching it through that module would ship zod to the browser to
 * describe a shape only the server validates — the same reason
 * `framesBeyondDuration.ts` sits apart from `./frames`, and
 * `lib/env/logLevels.ts` outside its barrel. One module rather than three:
 * the two bounds are coupled to each other and the phase is derived from one
 * of them, so a reader who has either has to have both.
 */

/**
 * How long a processing transcript may stand before it counts as stalled.
 *
 * Far past any healthy run — it exists for a run lost to a restart, which
 * leaves the row `processing` with nothing left to finish it. The collection
 * passes it to `jobStage.staleAfterMs`, and the Transcript tab measures
 * `updatedAt` against it, so the row's Edit view and the tab go stale
 * together.
 */
export const TRANSCRIPTION_STALL_MS = 15 * 60 * 1000

/**
 * How long after a transcript was asked for another request for the same
 * meditation is refused.
 *
 * Eligibility bounds nothing on its own: a vendor error that returns in two
 * seconds leaves the row `failed` and the control live again, so one meditation
 * could pay for a run as fast as an editor can click (#984). The existing row's
 * `createdAt` is the instant of the last request and no later write moves it, so
 * this needs no column and no migration.
 *
 * ⚠ **It must stay at or under `TRANSCRIPTION_STALL_MS`.** A `stalled` row is by
 * definition that old, so a longer cooldown would make the one phase nothing
 * else can clear permanently unretryable, behind a control that always refuses.
 * `tests/unit/transcript-throttle.spec.ts` holds that bound.
 */
export const RETRANSCRIBE_COOLDOWN_MS = 10 * 60 * 1000

export type TranscriptPhase = 'none' | 'pending' | 'stalled' | 'failed' | 'completed'

/**
 * How far a meditation's transcript has got: which notice the Transcript tab
 * shows, and which answer `POST /api/meditations/:id/transcript` gives. No row
 * means never transcribed: a replaced recording takes its row with it and a
 * fresh one is queued at once, so there is no out-of-date transcript to keep on
 * screen.
 *
 * An unparseable `updatedAt` keeps the wait, as it does in `jobStage`.
 *
 * ⚠ **One definition for the control and the refusal** (#984). The endpoint
 * decides eligibility from this function and the tab offers the button from it,
 * so a button cannot promise a retry the server refuses.
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

/**
 * Milliseconds left on the cooldown for a transcript asked for at
 * `requestedAt`, or `0` once it has passed.
 *
 * An unparseable or absent timestamp answers `0`. Refusing is the direction
 * nothing recovers from — the row would sit behind a control that never opens —
 * and the phase check still bounds what a request can cost.
 */
export function retranscribeWaitMs(
  requestedAt: string | null | undefined,
  now: number = Date.now(),
): number {
  if (!requestedAt) return 0
  const elapsed = now - Date.parse(requestedAt)
  if (!Number.isFinite(elapsed)) return 0
  return Math.max(0, RETRANSCRIBE_COOLDOWN_MS - elapsed)
}

/**
 * The remaining wait, worded for a person.
 *
 * One spelling for the refusal and the line beside the button, so the two
 * cannot name different waits for the same instant.
 */
export function retranscribeWaitLabel(waitMs: number): string {
  const seconds = Math.ceil(waitMs / 1000)
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}
