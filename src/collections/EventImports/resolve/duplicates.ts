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
 *
 * ⚠ **Every comparison below is integer arithmetic**, because the caller
 * compares a 500-row batch against every event in a region subtree. Each class
 * is reduced to a `PreparedCandidate` once, by `prepareCandidate`, and the
 * reduction never happens inside the loop. (`schedule.ts`'s `ScheduleKey` says
 * what that cost was.)
 */

import { DUPLICATE_ADDRESS_METERS, DUPLICATE_START_WINDOW_MINUTES } from '../constants'
import { metersBetween, type Point } from './distance'
import { scheduleKey, type ComparableSchedule, type ScheduleKey } from './schedule'

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
  /**
   * ⚠ **Null for an inactive class, which is then never a duplicate.** Both
   * rules below read a weekday and a dormant listing has none, so matching one
   * on its hall alone would skip a real class.
   */
  schedule: ComparableSchedule | null
}

export type PreparedCandidate = Omit<DuplicateCandidate, 'schedule'> & ScheduleKey

/** Reduce one class to what a comparison reads. Call once per class. */
export function prepareCandidate(candidate: DuplicateCandidate): PreparedCandidate {
  const { schedule, ...rest } = candidate
  return {
    ...rest,
    ...(schedule ? scheduleKey(schedule) : { weekdayMask: 0, startMinutes: null }),
  }
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
  a: PreparedCandidate,
  b: PreparedCandidate,
): DuplicateReason | null {
  if ((a.weekdayMask & b.weekdayMask) === 0) return null

  // Checked before the city rule because it is the stronger claim: two points
  // this close are one venue whatever either side called the city, and a
  // reviewer reading "nearby-address" learns more than "city-and-time" about a
  // pair that satisfies both.
  if (a.point && b.point && metersBetween(a.point, b.point) <= DUPLICATE_ADDRESS_METERS) {
    return 'nearby-address'
  }

  if (a.cityKey && a.cityKey === b.cityKey && withinStartWindow(a, b)) {
    return 'city-and-time'
  }

  return null
}

/**
 * The index of the first entry `candidate` duplicates, with the reason.
 *
 * The first rather than the closest: the answer is a skip and a link to one
 * existing class for the reviewer, and any true match serves that. The caller
 * holds its own rows, so an index is what it can map back — and taking prepared
 * entries is what keeps the reduction out of this loop.
 */
export function findDuplicate(
  candidate: PreparedCandidate,
  existing: readonly PreparedCandidate[],
): { index: number; reason: DuplicateReason } | null {
  for (const [index, entry] of existing.entries()) {
    const reason = duplicateReason(candidate, entry)
    if (reason) return { index, reason }
  }
  return null
}

/**
 * ⚠ **Minutes from midnight, compared without wrapping.** 23:50 and 00:10 are
 * 20 minutes apart on a clock face and almost a day apart as classes, and the
 * weekday they each belong to is the one the schedule named — so the clock-face
 * reading would merge a late-evening class into the next morning's.
 */
function withinStartWindow(a: PreparedCandidate, b: PreparedCandidate): boolean {
  if (a.startMinutes === null || b.startMinutes === null) return false
  return Math.abs(a.startMinutes - b.startMinutes) <= DUPLICATE_START_WINDOW_MINUTES
}
