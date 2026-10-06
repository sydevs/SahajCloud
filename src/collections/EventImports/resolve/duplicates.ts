/**
 * Whether two classes are the same class, and how sure that is.
 *
 * The import runs this against every existing non-trashed event in the target
 * subtree **and** against the rows above it in the same file, because a
 * volunteer's spreadsheet repeats a class as often as the CMS already holds one.
 *
 * ⚠ **A match is a question for the reviewer, never a silent decision.** Each
 * one defaults to a skip, and the review offers skip, import anyway, or (against
 * an existing class) overwrite (`endpoints/choices.ts`). So the two strengths
 * are about what the review says, not what happens: `strong` is the same hall at
 * the same time, `weak` the same town at the same time with no hall to compare,
 * and the review badges the second as a possible duplicate.
 *
 * ⚠ **Every rule needs the schedules to meet and the start times to agree.** A
 * morning and an evening class at one hall, a one-off in November and one in
 * December, the first and the third Tuesday — a shared address or a shared
 * weekday alone would call each pair one class.
 *
 * ⚠ **Every comparison below is integer arithmetic**, because the caller
 * compares a 500-row batch against every event in a region subtree. Each class
 * is reduced to a `PreparedCandidate` once, by `prepareCandidate`, and the
 * reduction never happens inside the loop. (`schedule.ts`'s `ScheduleKey` says
 * what that cost was.)
 */

import {
  DUPLICATE_ADDRESS_METERS,
  DUPLICATE_START_WINDOW_MINUTES,
  WEAK_DUPLICATE_METERS,
} from '../constants'
import { metersBetween, type Point } from './distance'
import {
  scheduleKey,
  schedulesOverlap,
  type ComparableSchedule,
  type ScheduleKey,
} from './schedule'

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
  /**
   * The hall, or null for a class with none: an online class, or one whose
   * geocode reached only the street or the town — a point, but not a hall's.
   */
  point: Point | null
  /** An online class meets nobody in person, so it never repeats a hall's class. */
  online: boolean
  /**
   * Null for an inactive class. A dormant listing has no schedule to compare,
   * so it can only repeat another dormant listing — by its hall, or as the same
   * town's online listing.
   */
  schedule: ComparableSchedule | null
}

export type PreparedCandidate = Omit<DuplicateCandidate, 'schedule'> &
  ScheduleKey & { inactive: boolean }

/** Reduce one class to what a comparison reads. Call once per class. */
export function prepareCandidate(candidate: DuplicateCandidate): PreparedCandidate {
  const { schedule, ...rest } = candidate
  return {
    ...rest,
    inactive: !schedule,
    ...(schedule ? scheduleKey(schedule) : { weekdayMask: 0, startMinutes: null }),
  }
}

/**
 * The one spelling of a city both sides of a comparison use.
 *
 * ⚠ **A resolved row and a stored event reach this from different places**, and
 * neither is an id: the row has Mapbox's `place` name, the event has whatever
 * `address.city` holds. They agree in practice because the admin address field
 * fills `city` from that same `context.place.name` — so the normalisation here
 * is what covers the hand-typed ones, and a Mapbox id on one side would match
 * nothing on the other.
 */
export function cityKeyFor(name: string | null | undefined): string | null {
  return comparableKey(name)
}

/**
 * The one normalisation every comparable key in this import is built with.
 *
 * ⚠ **Both halves of a key have to agree about what "the same text" means.** The
 * proposal's venue key is a city key and an address line joined, and the two were
 * normalised by separate copies of this rule — so the day it gains a step, such
 * as folding diacritics or dropping punctuation, one half would change and the
 * other would not. Nothing fails; a hall whose rows spell the street with and
 * without a comma just stops being one hall, and loses its node.
 */
export function comparableKey(value: string | null | undefined): string | null {
  const key = value?.trim().toLowerCase().replace(/\s+/g, ' ')
  return key || null
}

export type DuplicateReason = 'nearby-address' | 'city-and-time'
export type DuplicateStrength = 'strong' | 'weak'

export interface DuplicateMatch {
  reason: DuplicateReason
  strength: DuplicateStrength
}

/** Why these two are the same class, and how sure that is — or null. */
export function duplicateMatch(a: PreparedCandidate, b: PreparedCandidate): DuplicateMatch | null {
  if (a.inactive !== b.inactive) return null
  if (a.online !== b.online) return null
  if (!a.inactive && !(schedulesOverlap(a, b) && withinStartWindow(a, b))) return null

  const sameCity = !!a.cityKey && a.cityKey === b.cityKey
  if (a.point && b.point) {
    const meters = metersBetween(a.point, b.point)
    if (meters <= DUPLICATE_ADDRESS_METERS) return { reason: 'nearby-address', strength: 'strong' }
    // Two points a town apart are two halls, whatever the clock says.
    return sameCity && meters <= WEAK_DUPLICATE_METERS
      ? { reason: 'city-and-time', strength: 'weak' }
      : null
  }
  return sameCity ? { reason: 'city-and-time', strength: 'weak' } : null
}

/**
 * The entry `candidate` most surely duplicates, with the match.
 *
 * A strong match anywhere wins over an earlier weak one, because the reviewer
 * is shown one class and the one at the same hall is the one to compare against.
 */
export function findDuplicate(
  candidate: PreparedCandidate,
  existing: readonly PreparedCandidate[],
): ({ index: number } & DuplicateMatch) | null {
  let weak: ({ index: number } & DuplicateMatch) | null = null
  for (const [index, entry] of existing.entries()) {
    const match = duplicateMatch(candidate, entry)
    if (match?.strength === 'strong') return { index, ...match }
    if (match && !weak) weak = { index, ...match }
  }
  return weak
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
