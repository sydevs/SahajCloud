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
import { metersBetween, type Point } from '../resolve/distance'

/** What either grouping reads off one resolved row. */
export interface ClusterableRow {
  /** The row's line in the uploaded file — what a group reports back. */
  line: number
  point: Point
  /** `cityKey`, the one city spelling every resolved row carries. */
  cityKey: string
  /** Mapbox's `place` id, when the answer carried one. */
  placeId: string | null
  /** Mapbox's own name for the place, which is what a proposed city is named. */
  placeName: string | null
  /** ISO 3166-2 of the row's subdivision, for the state layer above the cities. */
  subdivisionCode: string | null
}

export interface CityCluster {
  /**
   * The place's own identity, stable across chunks: its Mapbox id where it has
   * one, else its city name. The proposal uses it as a node key, so it must not
   * depend on which rows happened to land in this call.
   */
  key: string
  /** Mapbox's name, falling back to the normalised key no row improved on. */
  name: string
  /** The `place` id a node is matched to an existing region on, where there is one. */
  placeId: string | null
  /** ISO 3166-2 the majority of the cluster's rows sit in, or null. */
  subdivisionCode: string | null
  /** Mean of the member rows' points — what the metro rule measures against. */
  centroid: Point
  /** Member lines, in file order. */
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
  const groups = new Map<string, ClusterableRow[]>()
  for (const row of rows) {
    const key = row.placeId ? `id:${row.placeId}` : `name:${row.cityKey}`
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }

  const clustered = [...groups].map(([key, members]) => clusterOf(key, members))
  return mergeMetros(clustered).map(({ points: _p, subdivisions: _s, ...cluster }) => cluster)
}

/**
 * A cluster plus the member points the merge reads.
 *
 * They are working state, not part of the answer: the metro rule asks where
 * every row of a place sits, and a `CityCluster` carries only the one point that
 * stands for the place.
 */
interface WorkingCluster extends CityCluster {
  points: Point[]
  /**
   * Every member row's subdivision, the absorbed places' rows included.
   *
   * ⚠ **`subdivisionCode` has to be re-read after a merge, not carried over.**
   * The state layer is built from it, so a Maharashtra city that absorbs a
   * Gujarat suburb must answer for all of its classes — the surviving place's
   * own rows are no longer all of them.
   */
  subdivisions: (string | null)[]
}

function clusterOf(key: string, members: readonly ClusterableRow[]): WorkingCluster {
  const points = members.map((row) => row.point)
  const subdivisions = members.map((row) => row.subdivisionCode)
  return {
    key,
    // The commonest city key, not the first row's: it is the same question
    // `commonest` answers for the place name, and a fallback reading row one
    // would name the node differently for a reordered file.
    name:
      commonest(members.map((row) => row.placeName)) ??
      commonest(members.map((row) => row.cityKey))!,
    placeId: commonest(members.map((row) => row.placeId)),
    subdivisionCode: commonest(subdivisions),
    centroid: centroidOf(points),
    lines: sortedLines(members.map((row) => row.line)),
    merged: [],
    points,
    subdivisions,
  }
}

/**
 * Member lines, ascending.
 *
 * Sorted on the way in rather than only after a merge: "in file order" has to
 * mean the same thing for every cluster in one result, or a caller comparing two
 * runs over one file reads a difference that is only arrival order.
 */
function sortedLines(lines: readonly number[]): number[] {
  return [...lines].sort((a, b) => a - b)
}

/**
 * Fold each place into the larger one it is a suburb of.
 *
 * ⚠ **Every member row must be inside the radius, not just the centroid.** A
 * cluster's centroid sits between its rows, so a ring of outlying villages
 * averages to a point near the city they ring and would merge on a centroid
 * test while no class in it is anywhere near town.
 *
 * ⚠ **Only into a place with strictly more rows, and never into one that is
 * itself merging away.** Equal counts would merge both ways round, and a chain
 * would move a suburb's classes under a city two hops from them — so a target
 * that has already been absorbed is not a target, and the pass runs **largest
 * first**, which is what makes that guard hold — see the loop.
 */
function mergeMetros(clusters: readonly WorkingCluster[]): WorkingCluster[] {
  // Largest first, ties broken by key. Both halves are load-bearing: the order
  // is what makes the chain guard below hold, and the tie-break is what settles
  // which of two equal-sized places absorbs the village between them — a file's
  // row order must not.
  const ranked = [...clusters].sort(
    (a, b) => b.lines.length - a.lines.length || a.key.localeCompare(b.key),
  )
  const absorbed = new Set<string>()

  // ⚠ **Largest first, which is what makes the chain guard hold.** Running
  // smallest first offers a village to its nearest town before that town has
  // merged into the city, so the guard sees an unabsorbed target and the
  // village's classes ride into a city 30 km from them. Descending order means a
  // place that is going to be absorbed already is by the time anything smaller
  // asks to join it.
  for (const cluster of ranked) {
    // ⚠ **The nearest eligible place, not the largest.** A village 1 km from a
    // town and 24 km from a bigger city belongs to the town, and taking the
    // first match in rank order files it under the city instead — which reads to
    // a reviewer as the import losing track of where the class is.
    const into = ranked
      .filter(
        (other) =>
          !absorbed.has(other.key) &&
          other.key !== cluster.key &&
          other.lines.length > cluster.lines.length &&
          withinMetro(cluster, other),
      )
      .sort(
        (a, b) =>
          metersBetween(cluster.centroid, a.centroid) -
            metersBetween(cluster.centroid, b.centroid) || a.key.localeCompare(b.key),
      )[0]
    if (!into) continue
    absorbed.add(cluster.key)
    into.lines = sortedLines([...into.lines, ...cluster.lines])
    into.subdivisions = [...into.subdivisions, ...cluster.subdivisions]
    into.subdivisionCode = commonest(into.subdivisions)
    into.merged.push({
      key: cluster.key,
      name: cluster.name,
      lines: cluster.lines,
      subdivisionCode: cluster.subdivisionCode,
    })
  }

  // ⚠ The survivor's `centroid` and `points` are deliberately left as they were.
  // The node stands for that city, and a reviewer reads its point as where the
  // city is — recentering it on the suburbs it took in would drift it, and a
  // later merge would then be measured from somewhere no class is.
  return ranked.filter((cluster) => !absorbed.has(cluster.key))
}

/** Whether every one of a place's rows sits inside another place's metro radius. */
function withinMetro(cluster: WorkingCluster, other: WorkingCluster): boolean {
  return cluster.points.every((point) => metersBetween(point, other.centroid) <= METRO_MERGE_METERS)
}

export interface VenueRow {
  line: number
  point: Point
  /** `cityKey` — part of the key, so one street name cannot span two towns. */
  cityKey: string
  /** The matched address feature's own Mapbox id, for an existing venue region. */
  mapboxId: string | null
  /** The row's `address` column, which is what identifies the hall. */
  address: string | null
  /** The row's `venueName` column, the name a volunteer gave the hall. */
  venueName: string | null
}

export interface VenueCluster {
  key: string
  name: string
  /** The address feature's id, for matching an existing venue region. */
  mapboxId: string | null
  centroid: Point
  lines: number[]
}

/**
 * Group a city target's rows into the halls worth their own node.
 *
 * ⚠ **A hall is identified by its address text, not by proximity and not by its
 * Mapbox id.** Two rows 20 m apart are a duplicate where they share a weekday
 * and two different halls where they do not, so a radius here would merge the
 * hall next door. The id is the tempting key and the wrong one: Mapbox answers
 * one query with the address and another with the POI inside it, so two rows a
 * volunteer typed identically can come back with different ids — and keying on
 * them splits the venue into two single-use groups, which the threshold then
 * drops, so the node is lost rather than merely duplicated. The id is still
 * reported, for matching an existing venue region.
 *
 * ⚠ **The city is part of the key**, because the address is a street line and
 * nothing else: "1 High Street" names a different hall in each town, and a city
 * target is confined no more tightly than its state (`targetScope.ts`), so two
 * towns in one batch is a shape that reaches here.
 *
 * Rows below the threshold are absent from the result, which is what keeps a
 * single-use address inline on the event rather than a node nobody navigates to.
 */
export function clusterVenues(rows: readonly VenueRow[]): VenueCluster[] {
  const groups = new Map<string, VenueRow[]>()
  for (const row of rows) {
    const key = venueKeyOf(row)
    if (!key) continue
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }

  return [...groups]
    .filter(([, members]) => members.length >= SHARED_VENUE_MIN_ROWS)
    .map(([key, members]) => ({
      key,
      // Normalised for display as well as for the key: an address copied out of
      // a spreadsheet arrives with its own spacing, and the key's spelling is
      // not a name to put in front of a volunteer either.
      name:
        commonest(members.map((row) => normalizeText(row.venueName))) ??
        commonest(members.map((row) => normalizeText(row.address)))!,
      mapboxId: commonest(members.map((row) => row.mapboxId)),
      centroid: centroidOf(members.map((row) => row.point)),
      lines: sortedLines(members.map((row) => row.line)),
    }))
}

/** A row naming no address names no hall, so it joins no venue. */
function venueKeyOf(row: VenueRow): string | null {
  const address = normalizeText(row.address)?.toLowerCase()
  return address ? `${row.cityKey}|${address}` : null
}

/** Trimmed, with runs of whitespace collapsed. Null for a blank. */
function normalizeText(value: string | null | undefined): string | null {
  const text = value?.trim().replace(/\s+/g, ' ')
  return text || null
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

/** Mean of the points, which is what the metro radius is measured from. */
function centroidOf(points: readonly Point[]): Point {
  const total = points.reduce(
    (sum, point) => ({
      latitude: sum.latitude + point.latitude,
      longitude: sum.longitude + point.longitude,
    }),
    { latitude: 0, longitude: 0 },
  )
  return {
    latitude: total.latitude / points.length,
    longitude: total.longitude / points.length,
  }
}
