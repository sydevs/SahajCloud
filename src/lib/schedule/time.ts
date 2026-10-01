/**
 * Wall-clock time parsing shared by the schedule field and the bulk import.
 *
 * ⚠ **The import writes through `scheduleFields`, so the two must accept the
 * same strings by construction.** They were two independent regexes plus two
 * independent start/end comparisons; a divergence meant a row the CSV accepted
 * failed at write — the one failure the import's error accumulation exists to
 * prevent.
 */

import { Temporal } from '@js-temporal/polyfill'

/** `HH:MM`, 24-hour, with an optional single-digit hour. */
export const HHMM_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/

export function isHHMM(value: string): boolean {
  return HHMM_PATTERN.test(value)
}

/**
 * `HH:MM` zero-padded, or null when the value is not a time.
 *
 * Padding is what makes a lexicographic compare correct, which is how both
 * callers order a start against an end — the pattern admits `9:30`.
 */
export function normalizeHHMM(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return isHHMM(trimmed) ? trimmed.padStart(5, '0') : null
}

/**
 * A local date and wall time in `timeZone`, as the UTC instant the
 * `firstDate` column stores.
 *
 * ⚠ **`timeZone` must be the zone that will also be written to
 * `firstDate_tz`.** Computing the instant in one zone and labelling the column
 * another puts the event and its whole recurrence hours out, and no later read
 * can detect it.
 */
export function localWallTimeToInstant(date: string, time: string, timeZone: string): string {
  const zoned = Temporal.ZonedDateTime.from(`${date}T${time}:00[${timeZone}]`)
  return new Date(zoned.toInstant().epochMilliseconds).toISOString()
}
