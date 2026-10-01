/**
 * How a batch's resolved rows group into the places a region node is proposed
 * for.
 *
 * Two groupings, each the whole answer for one target level. A country or state
 * target groups rows into **cities** — Mapbox's `place` per row, with a suburb
 * folded into the metro it belongs to. A city target groups them into
 * **venues** — one node per hall two or more classes meet at.
 *
 * ⚠ **Both are pure, and neither reads the region tree.** Which existing region
 * a group turns out to be, and whether a state layer sits above the cities, are
 * separate questions answered against the tree. What is settled here is only
 * which rows belong together, which is the part a threshold decides and a spec
 * can pin.
 */

import { METRO_MERGE_METERS, SHARED_VENUE_MIN_ROWS } from '../constants'
import { centroidOf, metersBetween, type Point } from '../resolve/distance'
import { comparableKey } from '../resolve/duplicates'

/** What either grouping reads off one resolved row. */
export interface ClusterableRow {
  line: number
  point: Point
  cityKey: string
  placeId: string | null
  /** Mapbox's own name for the place, which is what a proposed city is named. */
  placeName: string | null
  /** ISO 3166-2, for the state layer the proposal may add above the cities. */
  subdivisionCode: string | null
}

export interface CityCluster {
  /**
   * The place's own identity, stable across chunks: its Mapbox id where it has
   * one, else its city name. The proposal uses it as a node key, so it must not
   * depend on which rows happened to land in this call.
   */
  key: string
  /** Mapbox's name, falling back to the city key no row improved on. */
  name: string
  placeId: string | null
  /** ISO 3166-2 the majority of the node's classes sit in, absorbed ones included. */
  subdivisionCode: string | null
  centroid: Point
  lines: number[]
  /**
   * The places folded into this one by the metro rule, in the order they were
   * absorbed. Reported so the review can say what a node took in, rather than
   * silently showing one city where the file named four.
   */
  merged: MergedPlace[]
}

export interface MergedPlace {
  key: string
  name: string
  lines: number[]
  /** Its own subdivision, which the surviving node's may no longer name. */
  subdivisionCode: string | null
}

/**
 * Group rows into the cities a region node is proposed for.
 *
 * ⚠ **Rows are keyed by their place id and only then by their city name.** A
 * place is the unit the merge below reasons about, and two same-named towns at
 * opposite ends of a country are two places — keying on the name alone would
 * collapse them into one node holding both. The name is the fallback because
 * `placeId` is nullable: Mapbox carries the `place` layer in a result's context,
 * and an online row placed by its town alone does not always get one back.
 *
 * ⚠ **That fallback is also what the metro merge repairs.** One town whose rows
 * split between an id-keyed group and a name-keyed one is two clusters at the
 * same centroid, so the smaller merges into the larger on the first rule below
 * — which is why a missing place id costs a merge rather than a duplicate city.
 */
export function clusterCities(rows: readonly ClusterableRow[]): CityCluster[] {
  const groups = groupRows(rows, (row) => (row.placeId ? `id:${row.placeId}` : `name:${row.cityKey}`))
  const places = [...groups].map(([key, own]) => ({ key, own, absorbed: [] as Place[] }))
  return mergeMetros(places).map(asCityCluster)
}

/**
 * One place mid-pass: the rows that are its own, and the places it has taken in.
 *
 * ⚠ **The split is the point.** A node's classes are its own rows plus every
 * absorbed place's, while its *location* is only ever its own — recentering a
 * city on the suburbs it absorbed would drift it away from the city, and a later
 * merge would then be measured from somewhere no class is. Keeping the two sets
 * apart is what makes that structural instead of a rule to remember.
 */
interface Place {
  key: string
  own: ClusterableRow[]
  absorbed: Place[]
}

/** Every row under a place, the absorbed places' rows included. */
function allRows(place: Place): ClusterableRow[] {
  return [...place.own, ...place.absorbed.flatMap(allRows)]
}

function asCityCluster(place: Place): CityCluster {
  const rows = allRows(place)
  return {
    key: place.key,
    // Named from its own rows, not the absorbed ones: the node stands for this
    // place, and what it took in is reported in `merged`.
    name:
      commonest(place.own.map((row) => row.placeName)) ??
      commonest(place.own.map((row) => row.cityKey))!,
    placeId: commonest(place.own.map((row) => row.placeId)),
    subdivisionCode: commonest(rows.map((row) => row.subdivisionCode)),
    centroid: centroidOf(place.own.map((row) => row.point)),
    lines: sortedLines(rows.map((row) => row.line)),
    merged: place.absorbed.map(asMergedPlace),
  }
}

function asMergedPlace(place: Place): MergedPlace {
  const { key, name, lines, subdivisionCode } = asCityCluster(place)
  return { key, name, lines, subdivisionCode }
}

/**
 * Fold each place into the larger one it is a suburb of.
 *
 * ⚠ **Every member row must be inside the radius, not just the centroid.** A
 * place's centroid sits between its rows, so a ring of outlying villages
 * averages to a point near the city they ring and would merge on a centroid test
 * while no class in it is anywhere near town.
 *
 * ⚠ **Only into a place with strictly more rows, and never into one that is
 * itself merging away.** Equal counts would merge both ways round.
 */
function mergeMetros(places: readonly Place[]): Place[] {
  // Ties by key, so a file's row order cannot decide which of two equal-sized
  // places absorbs the village between them.
  const ranked = [...places].sort(
    (a, b) => b.own.length - a.own.length || a.key.localeCompare(b.key),
  )
  const absorbed = new Set<string>()
  // Once per place rather than once per candidate pair: the pass is quadratic in
  // places already, and a centroid is a pass over that place's every row.
  const centroids = new Map(ranked.map((place) => [place.key, centroidOf(place.own.map((row) => row.point))]))

  // ⚠ **Largest first, which is what makes the chain guard hold.** Running
  // smallest first offers a village to its nearest town before that town has
  // merged into the city, so the guard sees an unabsorbed target and the
  // village's classes ride into a city 30 km from them.
  for (const place of ranked) {
    const into = nearestMetro(place, ranked, absorbed, centroids)
    if (!into) continue
    absorbed.add(place.key)
    into.absorbed.push(place)
  }

  return ranked.filter((place) => !absorbed.has(place.key))
}

/**
 * The nearest place this one is a suburb of, or none.
 *
 * ⚠ **Nearest, not largest.** A village 1 km from a town and 24 km from a bigger
 * city belongs to the town, and taking the first match in rank order files it
 * under the city instead — which reads to a reviewer as the import losing track
 * of where the class is.
 */
function nearestMetro(
  place: Place,
  ranked: readonly Place[],
  absorbed: ReadonlySet<string>,
  centroids: ReadonlyMap<string, Point>,
): Place | undefined {
  let best: Place | undefined
  let bestMeters = Infinity
  const from = centroids.get(place.key)!

  for (const other of ranked) {
    if (other.key === place.key || absorbed.has(other.key)) continue
    if (other.own.length <= place.own.length) continue
    const to = centroids.get(other.key)!
    if (!place.own.every((row) => metersBetween(row.point, to) <= METRO_MERGE_METERS)) continue

    const meters = metersBetween(from, to)
    if (meters < bestMeters || (meters === bestMeters && other.key.localeCompare(best!.key) < 0)) {
      best = other
      bestMeters = meters
    }
  }
  return best
}

export interface VenueRow {
  line: number
  point: Point
  /** Part of the key, so one street name cannot span two towns. */
  cityKey: string
  /** The matched address feature's id, for matching an existing venue region. */
  mapboxId: string | null
  address: string | null
  venueName: string | null
}

export interface VenueCluster {
  key: string
  name: string
  mapboxId: string | null
  centroid: Point
  lines: number[]
}

/**
 * Group a city target's rows into the halls worth their own node.
 *
 * ⚠ **A hall is identified by its address text, not by proximity and not by its
 * Mapbox id.** A radius would merge the hall next door, and the id is the
 * tempting key and the wrong one: Mapbox answers one query with the address and
 * another with the POI inside it, so two rows a volunteer typed identically can
 * come back with different ids — and keying on them splits the venue into two
 * single-use groups, which the threshold then drops, so the node is lost rather
 * than merely duplicated.
 *
 * ⚠ **The city is part of the key**, because the address is a street line and
 * nothing else: "1 High Street" names a different hall in each town, and a city
 * target is confined no more tightly than its state (`targetScope.ts`), so two
 * towns in one batch is a shape that reaches here.
 */
export function clusterVenues(rows: readonly VenueRow[]): VenueCluster[] {
  return [...groupRows(rows, venueKeyOf)]
    .filter(([, members]) => members.length >= SHARED_VENUE_MIN_ROWS)
    .map(([key, members]) => ({
      key,
      // Normalised for display too: an address copied out of a spreadsheet
      // arrives with its own spacing, and the key is lower-cased, so neither is
      // a name to put in front of a volunteer.
      name:
        commonest(members.map((row) => tidy(row.venueName))) ??
        commonest(members.map((row) => tidy(row.address)))!,
      mapboxId: commonest(members.map((row) => row.mapboxId)),
      centroid: centroidOf(members.map((row) => row.point)),
      lines: sortedLines(members.map((row) => row.line)),
    }))
}

/** A row naming no address names no hall, so it joins no venue. */
function venueKeyOf(row: VenueRow): string | null {
  // `comparableKey`, not a second trim-and-lowercase: `row.cityKey` is built with
  // it, and the two halves of this key have to stay one rule (`duplicates.ts`).
  const address = comparableKey(row.address)
  return address ? `${row.cityKey}|${address}` : null
}

/** Rows by key, in first-seen order. A row the key function refuses is left out. */
function groupRows<T>(
  rows: readonly T[],
  keyOf: (row: T) => string | null,
): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const key = keyOf(row)
    if (!key) continue
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  return groups
}

/**
 * The most frequent non-null value, first seen winning a tie.
 *
 * ⚠ **Not the first value.** Mapbox answers the same town with a different
 * `place` name often enough — a district on one row, the city on the next — that
 * taking row one's spelling would name a node after whichever class the
 * volunteer happened to type first.
 */
function commonest<T>(values: readonly (T | null | undefined)[]): T | null {
  const counts = new Map<T, number>()
  for (const value of values) {
    if (value === null || value === undefined) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  let best: T | null = null
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

/** Sorted for every cluster, so "file order" means the same for one that absorbed nothing. */
function sortedLines(lines: readonly number[]): number[] {
  return [...lines].sort((a, b) => a - b)
}

/** Trimmed, with runs of whitespace collapsed. Null for a blank. */
function tidy(value: string | null | undefined): string | null {
  const text = value?.trim().replace(/\s+/g, ' ')
  return text || null
}
