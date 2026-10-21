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
 *
 * Zod-free and apart from `./transcript` like its neighbours, because the
 * control in the Transcript tab reads it too.
 */
export const RETRANSCRIBE_COOLDOWN_MS = 10 * 60 * 1000

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
