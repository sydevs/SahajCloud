/**
 * The region tree a batch proposes, assembled from the parts that decided it.
 *
 * `cluster.ts` says which rows are one place, `states.ts` whether a layer sits
 * above them, `match.ts` which of those places the Atlas already holds, and
 * `slugs.ts` what the rest will be called. This joins the four into the one
 * structure the review renders and the commit walks.
 *
 * ⚠ **Pure, and every tree read is the caller's.** `existing` and `takenSlugs`
 * are passed in, so what a proposal comes to depends only on its arguments —
 * which is what lets a spec pin the shapes that matter (a city already managed
 * elsewhere, a state layer that groups nothing, a name that collides on commit)
 * without a database.
 *
 * ⚠ **Nothing here is created and nothing is written.** The commit (phase 6)
 * walks `nodes` parent-first; this only says what it would do.
 */

import type { Region } from '@/payload-types'

import { MANUAL_RADIUS_MIN_METERS } from '../constants'
import {
  clusterCities,
  clusterVenues,
  type ClusterableRow,
  type MergedPlace,
  type VenueRow,
} from './cluster'
import { matchNode, type ExistingRegion, type NodeMatch } from './match'
import { assignSlugs, type SluggableNode } from './slugs'
import { decideStateLayer, type StateLayerDecision } from './states'
import { centroidOf, metersBetween, type Point } from '../resolve/distance'

/** One resolved row, carrying what both groupings read. */
export interface ProposableRow extends ClusterableRow, VenueRow {}

/** Where a node the commit creates sits on the map. */
export type ProposedLocation =
  /** A geocoded feature: the commit hands Mapbox's own id to `Regions.mapboxId`. */
  | { kind: 'mapbox'; mapboxId: string }
  /**
   * No feature to name it by — a state proposed from its ISO code, or a city
   * whose rows came back with no `place` id. The commit writes a `manual-` id
   * and these coordinates, the shape `Regions` already requires for a location
   * entered by hand.
   */
  | { kind: 'manual'; latitude: number; longitude: number; radius: number }

export interface ProposedNode {
  /** Stable across calls, so the review can address a node it renamed. */
  key: string
  level: Extract<Region['level'], 'region' | 'city' | 'venue'>
  /** Mapbox's name, or ISO's for a state. What the review shows and may rename. */
  name: string
  /** The proposed node above it, or null when it hangs off the target itself. */
  parentKey: string | null
  match: NodeMatch
  /**
   * ⚠ **Both are null for a node that is not created**, which is every match
   * other than `create`. An existing region keeps the slug and the location it
   * already has, and computing a slug for one would spend a name from a
   * collection-wide namespace that nothing is going to claim.
   */
  slug: string | null
  location: ProposedLocation | null
  /** The CSV lines this node's classes come from, the absorbed places' included. */
  lines: number[]
  /** What the metro rule folded in, so the review can say so. Cities only. */
  merged?: MergedPlace[]
}

/** A row the proposal cannot place, reported rather than committed. */
export interface ProposedRowError {
  line: number
  message: string
}

export interface ProposedTree {
  /** Parent-first, so the commit can create them in order. */
  nodes: ProposedNode[]
  rowErrors: ProposedRowError[]
  /** Kept with its reason, because the review has to explain a missing layer. */
  stateLayer: StateLayerDecision
}

/**
 * The levels a batch can target.
 *
 * ⚠ **`venue` is excluded deliberately.** A venue is the bottom of the tree, so
 * there is nothing to propose beneath it — and `ALLOWED_PARENT_LEVELS`
 * (`Regions.ts`) refuses a city under one, so proposing the city layer for it
 * would build a tree the commit cannot write. `targetRegion` carries no
 * `filterOptions`, so the endpoint that creates a batch owes this refusal; the
 * narrow type is what obliges it to.
 */
export type ProposableTargetLevel = Extract<Region['level'], 'country' | 'region' | 'city'>

export interface ProposeTreeArgs {
  target: { id: number; level: ProposableTargetLevel; name: string }
  /** The target country's ISO alpha-2, for naming subdivisions. */
  countryCode: string
  /** Resolved rows worth a node: the errored and the duplicated are left out. */
  rows: readonly ProposableRow[]
  /** The target's subtree, plus any region holding a feature this batch geocoded. */
  existing: readonly ExistingRegion[]
  /** Every slug `regions` already holds, so a created node cannot collide. */
  takenSlugs: Iterable<string>
}

export function buildProposedTree({
  target,
  countryCode,
  rows,
  existing,
  takenSlugs,
}: ProposeTreeArgs): ProposedTree {
  const { nodes, stateLayer } =
    target.level === 'city'
      ? {
          nodes: venueNodes(rows, target.id, existing),
          // `decideStateLayer` is the one place that says why a city target
          // gains no layer.
          stateLayer: decideStateLayer({ targetLevel: 'city', countryCode: '', cities: [] }),
        }
      : cityNodes({ target, countryCode, rows, existing })

  assignSlugsTo(nodes, target.name, takenSlugs)
  return { nodes, rowErrors: rowErrorsFor(nodes), stateLayer }
}

interface CityNodesArgs {
  target: ProposeTreeArgs['target']
  countryCode: string
  rows: readonly ProposableRow[]
  existing: readonly ExistingRegion[]
}

/** The cities a country or state target proposes, under a state layer where one is earned. */
function cityNodes({ target, countryCode, rows, existing }: CityNodesArgs): {
  nodes: ProposedNode[]
  stateLayer: StateLayerDecision
} {
  const cities = clusterCities(rows)
  const stateLayer = decideStateLayer({
    targetLevel: target.level,
    countryCode,
    cities: cities.map(({ key, subdivisionCode }) => ({ key, subdivisionCode })),
  })

  const byLine = new Map(rows.map((row) => [row.line, row]))
  /** A node's own classes, which is what its radius has to cover. */
  const pointsOf = (lines: readonly number[]): Point[] =>
    lines.map((line) => byLine.get(line)?.point).filter((point): point is Point => !!point)
  const cityOf = (key: string) => cities.find((city) => city.key === key)

  const states: ProposedNode[] = []
  /** Which state node a city hangs under, and the existing region id that is. */
  const parentOf = new Map<string, { key: string | null; id: number | null }>()

  if (stateLayer.proposed) {
    for (const state of stateLayer.states) {
      const key = `state:${state.code}`
      const members = state.cityKeys.map(cityOf).filter((city) => !!city)
      const lines = members.flatMap((city) => city.lines)
      // Located from its cities rather than from every class in them: a state
      // stands for the places under it, and a city with 90 classes would
      // otherwise drag the state's centre onto itself.
      const seats = members.map((city) => city.centroid)
      const match = matchNode(
        { level: 'region', name: state.name, mapboxId: null, parentId: target.id },
        existing,
      )
      states.push({
        key,
        level: 'region',
        name: state.name,
        parentKey: null,
        match,
        slug: null,
        location: locationFor({
          mapboxId: null,
          level: 'region',
          // Non-empty: a state is proposed only for the cities that grouped
          // under it.
          centre: centroidOf(seats),
          extent: seats,
          match,
        }),
        lines: [...lines].sort((a, b) => a - b),
      })
      // Null when the state is itself proposed — see `MatchableNode.parentId`.
      const id = match.kind === 'existing' ? match.regionId : null
      for (const cityKey of state.cityKeys) parentOf.set(cityKey, { key, id })
    }
  }

  const cityNodeList = cities.map((city) => {
    const parent = parentOf.get(city.key) ?? { key: null, id: target.id }
    const match = matchNode(
      { level: 'city', name: city.name, mapboxId: city.placeId, parentId: parent.id },
      existing,
    )
    return {
      key: `city:${city.key}`,
      level: 'city' as const,
      name: city.name,
      // ⚠ **A city the Atlas already holds keeps the parent it has.** Moving a
      // node is out of scope, so naming a proposed state as its parent would
      // promise a re-parenting the commit does not perform — and a Pune that
      // hangs straight off India, the mixed tree the Atlas really has, would
      // read in the review as about to move under a brand-new Maharashtra.
      parentKey: match.kind === 'existing' ? null : parent.key,
      match,
      slug: null,
      location: locationFor({
        mapboxId: city.placeId,
        level: 'city',
        centre: city.centroid,
        extent: pointsOf(city.lines),
        match,
      }),
      lines: city.lines,
      ...(city.merged.length ? { merged: city.merged } : {}),
    }
  })

  return { nodes: [...keepPeopledStates(states, cityNodeList), ...cityNodeList], stateLayer }
}

/**
 * Drop a proposed state that no new city hangs under.
 *
 * ⚠ **A state whose every city already exists would be created with no
 * children.** Those cities keep their own parents (above), so the layer has
 * nothing to group — and its name, slug, centre and radius were all computed
 * from cities that stay where they are. An empty region in the tree is worse
 * than no layer, which is the shape `decideStateLayer` already calls acceptable.
 */
function keepPeopledStates(
  states: readonly ProposedNode[],
  cities: readonly ProposedNode[],
): ProposedNode[] {
  return states.filter((state) =>
    cities.some((city) => city.parentKey === state.key && city.match.kind === 'create'),
  )
}

/** The halls a city target proposes, each hanging straight off it. */
function venueNodes(
  rows: readonly ProposableRow[],
  targetId: number,
  existing: readonly ExistingRegion[],
): ProposedNode[] {
  return clusterVenues(rows).map((venue) => {
    const match = matchNode(
      { level: 'venue', name: venue.name, mapboxId: venue.mapboxId, parentId: targetId },
      existing,
    )
    return {
      key: `venue:${venue.key}`,
      level: 'venue' as const,
      name: venue.name,
      parentKey: null,
      match,
      slug: null,
      location: locationFor({
        mapboxId: venue.mapboxId,
        level: 'venue',
        centre: venue.centroid,
        extent: [venue.centroid],
        match,
      }),
      lines: venue.lines,
    }
  })
}

/**
 * What the commit would write as the node's location, or null when it writes
 * nothing.
 *
 * ⚠ **The radius covers `extent`, not the place Mapbox knows.** A hand-located
 * node has no feature to take an extent from, so the only honest answer is how
 * far its own members reach — floored, because one address reaches nowhere.
 */
function locationFor({
  mapboxId,
  level,
  centre,
  extent,
  match,
}: LocationArgs): ProposedLocation | null {
  if (match.kind !== 'create') return null
  if (mapboxId) return { kind: 'mapbox', mapboxId }

  const reach = Math.max(...extent.map((point) => metersBetween(centre, point)), 0)
  return {
    kind: 'manual',
    latitude: centre.latitude,
    longitude: centre.longitude,
    radius: Math.round(Math.max(reach, MANUAL_RADIUS_MIN_METERS[level])),
  }
}

interface LocationArgs {
  mapboxId: string | null
  /** Which floor applies — a state is not town-sized (`constants.ts`). */
  level: ProposedNode['level']
  /**
   * ⚠ **The node's own seat, never the mean of `extent`.** A merged city's
   * centroid is the centroid of the rows that were its own, deliberately
   * (`cluster.ts`) — re-centring it on the suburbs it absorbed is the drift
   * that rule exists to prevent, and it would reach here as a plausible mean.
   */
  centre: Point
  /** Everything the node has to cover, which for a merged city is more than its seat. */
  extent: readonly Point[]
  match: NodeMatch
}

/**
 * Give every node the commit creates a slug, in the order they are proposed.
 *
 * ⚠ **The parent's name is read across every node, matched ones included.** A
 * city under a state the Atlas already holds still disambiguates on that
 * state's name, and looking only at the created nodes would lose the one
 * disambiguator it has.
 *
 * ⚠ **A node with no proposed parent disambiguates on the target.** It is the
 * parent the commit will give it, so without this the `name-parent` rule never
 * fires for a top-level node and `slugs.ts`'s own worked example — Georgia the
 * state becoming `georgia-united-states` — is unreachable.
 */
function assignSlugsTo(
  nodes: readonly ProposedNode[],
  targetName: string,
  takenSlugs: Iterable<string>,
): void {
  const created = nodes.filter((node) => node.match.kind === 'create')
  const sluggable: SluggableNode[] = created.map((node) => ({
    key: node.key,
    name: node.name,
    level: node.level,
    parentName: nodes.find((other) => other.key === node.parentKey)?.name ?? targetName,
  }))
  const slugs = assignSlugs(sluggable, takenSlugs)
  for (const node of created) node.slug = slugs.get(node.key)!
}

/**
 * ⚠ **The message says the city exists outside the target, never who holds it.**
 * "Outside the target" is all `inTarget` answers, and the two cases it covers
 * read very differently to a volunteer: a city another organisation manages, and
 * one of their own hanging off the country while they import into a state — the
 * mixed tree the Atlas really has. Saying "somebody else manages this" would be
 * false for the second, and naming the region would be wrong for the first, so
 * the message states only what is true of both and what they can act on.
 */
function rowErrorsFor(nodes: readonly ProposedNode[]): ProposedRowError[] {
  return nodes
    .filter((node) => node.match.kind === 'elsewhere')
    .flatMap((node) =>
      node.lines.map((line) => ({
        line,
        message: `"${node.name}" already exists outside this region of the Atlas, so its classes cannot be imported here. Import them from the region that holds it.`,
      })),
    )
    .sort((a, b) => a.line - b.line)
}
