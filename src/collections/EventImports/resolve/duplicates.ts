/**
 * Whether two classes are the same class.
 *
 * The import runs this against every existing non-trashed event in the target
 * subtree **and** against the rows above it in the same file, because a
 * volunteer's spreadsheet repeats a class as often as the CMS already holds one.
 *
 * ⚠ **A match is always a skip, never an overwrite.** Nothing here decides what
 * to change about an existing event, because the import changes nothing about
 * one — so a false positive costs a row somebody re-uploads, while a false
 * negative publishes a duplicate listing a seeker has to choose between. The
 * thresholds lean accordingly.
 */

import { DUPLICATE_ADDRESS_METERS, DUPLICATE_START_WINDOW_MINUTES } from '../constants'
import { metersBetween, type Point } from './distance'
import { occurrenceWeekdays, wallStartTime, type ComparableSchedule } from './schedule'

export interface DuplicateCandidate {
  /**
   * What the two sides mean by "the same city", or null when one has none.
   *
   * Both sides must spell it the same way, and only the caller can: a resolved
   * row holds a Mapbox place id while a stored event holds a region, so the
   * comparable key is whichever the caller has for both. A null never matches,
   * including another null — "neither has a city" is not agreement.
   */
  cityKey: string | null
  /** Null for a row with no point, which then matches on city and time alone. */
  point: Point | null
  schedule: ComparableSchedule | null
}

export type DuplicateReason = 'nearby-address' | 'city-and-time'

/**
 * Why these two are the same class, or null.
 *
 * Both rules need a shared weekday, because a Tuesday class and a Thursday
 * class at one address are two classes — the case a bare address match gets
 * wrong, and the reason the address rule is not simply "same place".
 */
export function duplicateReason(
  a: DuplicateCandidate,
  b: DuplicateCandidate,
): DuplicateReason | null {
  if (!sharesWeekday(a.schedule, b.schedule)) return null

  // Checked before the city rule because it is the stronger claim: two points
  // this close are one venue whatever either side called the city, and a
  // reviewer reading "nearby-address" learns more than "city-and-time" about a
  // pair that satisfies both.
  if (a.point && b.point && metersBetween(a.point, b.point) <= DUPLICATE_ADDRESS_METERS) {
    return 'nearby-address'
  }

  if (a.cityKey && a.cityKey === b.cityKey && withinStartWindow(a.schedule, b.schedule)) {
    return 'city-and-time'
  }

  return null
}

/**
 * The first entry `candidate` duplicates, with the reason.
 *
 * Returns the first rather than the closest: the answer is a skip and a link to
 * one existing class for the reviewer, and any true match serves that.
 */
export function findDuplicate<T>(
  candidate: DuplicateCandidate,
  existing: readonly T[],
  keyOf: (entry: T) => DuplicateCandidate,
): { entry: T; reason: DuplicateReason } | null {
  for (const entry of existing) {
    const reason = duplicateReason(candidate, keyOf(entry))
    if (reason) return { entry, reason }
  }
  return null
}

/**
 * ⚠ **An inactive class has no schedule, so it is never a duplicate here.**
 * Both rules read a weekday, and a dormant listing has none — matching it on
 * address alone would skip a real class because a long-dormant one shares its
 * hall.
 */
function sharesWeekday(
  a: ComparableSchedule | null,
  b: ComparableSchedule | null,
): boolean {
  if (!a || !b) return false
  const right = new Set<string>(occurrenceWeekdays(b))
  // A schedule that yields no weekday — an unreadable one — shares none, which
  // `some` on an empty list already answers.
  return occurrenceWeekdays(a).some((code) => right.has(code))
}

function withinStartWindow(
  a: ComparableSchedule | null,
  b: ComparableSchedule | null,
): boolean {
  const left = a && wallStartTime(a)
  const right = b && wallStartTime(b)
  if (!left || !right) return false
  return Math.abs(minutesOfDay(left) - minutesOfDay(right)) <= DUPLICATE_START_WINDOW_MINUTES
}

/**
 * ⚠ **Minutes from midnight, compared without wrapping.** 23:50 and 00:10 are
 * 20 minutes apart on a clock face and almost a day apart as classes, and the
 * weekday they each belong to is the one the schedule named — so the clock-face
 * reading would merge a late-evening class into the next morning's.
 */
function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}
