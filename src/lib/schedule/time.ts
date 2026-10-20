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

/**
 * `HH:MM`, 24-hour, with an optional single-digit hour.
 *
 * ⚠ **Not exported.** Publishing the grammar invites the fourth copy of it,
 * which is the thing this module exists to delete. Ask `isHHMM`.
 */
const HHMM_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/

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
 * Minutes since local midnight for an `HH:MM` string, or null when it is not one.
 *
 * Tested with `HHMM_PATTERN` above rather than a second regex, so the grammar
 * and the range it admits have one statement. Two callers compare a start
 * against an end this way, and both reached it through their own copy.
 */
export function minutesOfDay(value: string | null | undefined): number | null {
  const match = value?.trim().match(HHMM_PATTERN)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/**
 * What to do with a wall time that does not exist, because the clocks moved
 * forward over it.
 *
 * ⚠ **`shift` is Temporal's default and it is silent.** `02:30` on a
 * spring-forward date becomes `03:30`, so a start time the caller accepted
 * reads back an hour later — and a start/end pair that was an hour apart can
 * come back inverted, which `scheduleFields`' own validator then refuses. A
 * caller with somebody to report to wants `reject`.
 */
type GapPolicy = 'shift' | 'reject'

/**
 * A local date and wall time in `timeZone`, as the UTC instant the
 * `firstDate` column stores.
 *
 * ⚠ **`timeZone` must be the zone that will also be written to
 * `firstDate_tz`.** Computing the instant in one zone and labelling the column
 * another puts the event and its whole recurrence hours out, and no later read
 * can detect it.
 *
 * Throws on a nonexistent wall time under `reject`.
 */
export function localWallTimeToInstant(
  date: string,
  time: string,
  timeZone: string,
  onGap: GapPolicy = 'shift',
): string {
  const zoned = Temporal.ZonedDateTime.from(`${date}T${time}:00[${timeZone}]`)

  // ⚠ **`disambiguation: 'reject'` is NOT the check for a gap** — it also
  // refuses an AMBIGUOUS time, the hour a fall-back transition repeats. That
  // time genuinely exists, so refusing it would reject a valid class one day a
  // year. A gap is instead identified by the shift itself: `compatible` moves a
  // nonexistent wall time forward, so the result reads back as a different
  // wall time, while an ambiguous one round-trips unchanged.
  if (onGap === 'reject' && zoned.toPlainTime().toString({ smallestUnit: 'minute' }) !== time) {
    throw new RangeError(`${time} does not exist on ${date} in ${timeZone}`)
  }

  return new Date(zoned.toInstant().epochMilliseconds).toISOString()
}
