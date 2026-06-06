/**
 * Count how many frame timestamps fall beyond the audio duration.
 *
 * Intentionally self-contained — it does NOT reuse `normalizeMeditationFrames`
 * from `./frames`, which imports `@sentry/nextjs` (and `payload`) and would
 * bloat the admin client bundle. This helper is imported by the `'use client'`
 * AudioUpload drift banner, so it must stay free of server-only dependencies.
 *
 * Frame timestamps and `duration` are both in seconds. A frame whose timestamp
 * equals the duration is still in range; only strictly-greater timestamps count
 * as drifted. Returns 0 when `duration` is missing or non-positive (there is
 * nothing meaningful to compare against).
 */
export function countFramesBeyondDuration(framesValue: unknown, duration: unknown): number {
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
    return 0
  }
  if (!Array.isArray(framesValue)) {
    return 0
  }

  return framesValue.filter((frame) => {
    const timestamp = (frame as { timestamp?: unknown } | null)?.timestamp
    return typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > duration
  }).length
}
