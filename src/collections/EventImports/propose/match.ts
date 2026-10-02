/**
 * Which existing region a proposed node already is, if any.
 *
 * The grouping steps (`cluster.ts`, `states.ts`) decide which rows belong
 * together without reading the region tree. This is the question that needs the
 * tree: a batch for a country the Atlas already holds cities in must land its
 * classes on those cities rather than propose second copies beside them.
 *
 * ⚠ **Two rules, in this order: the Mapbox id, then the name under the same
 * parent.** The id is the strong claim — one feature is one place, whatever
 * either side calls it, so it matches München to a node an English-locale admin
 * named Munich. The name is the fallback for the nodes that have no id to match
 * on: every region seeded by hand carries a `manual-` id of its own
 * (`src/lib/mapbox/manualLocation.ts`), which no geocode will ever return.
 *
 * ⚠ **A feature already used outside the target's subtree is refused, not
 * matched.** `Regions.mapboxId` is unique collection-wide, so the city exists
 * exactly once and it is not under this target; creating a second node for it
 * would fail the constraint, and matching it would put classes outside the
 * region the batch was aimed at. Its rows become row errors instead.
 *
 * ⚠ **That is not the same as "somebody else manages it".** The region may well
 * be the uploader's own — a Pune hanging off India while they import into
 * Maharashtra is the mixed tree the Atlas has — so nothing downstream may tell
 * them whose it is. `rowErrorsFor` (`tree.ts`) owns the wording this obliges.
 */

import type { Region } from '@/payload-types'

import { comparableKey } from '../resolve/duplicates'

/** What matching reads off one existing region. */
export interface ExistingRegion {
  id: number
  level: Region['level']
  name?: string | null
  slug?: string | null
  mapboxId?: string | null
  /** The node's own direct parent, or null for a country. */
  parentId: number | null
  /**
   * Whether the region sits in the batch target's subtree, the target itself
   * included. The caller decides it, because "inside the target" is a tree read
   * and this file does none.
   */
  inTarget: boolean
}

/** A node the proposal wants, before it is known whether it already exists. */
export interface MatchableNode {
  level: Region['level']
  name: string
  /** The geocoded feature behind the node, where it has one. */
  mapboxId: string | null
  /**
   * The existing region the node would hang under, or null when its own parent
   * is itself proposed.
   *
   * ⚠ **Null disables the name rule rather than widening it.** A city under a
   * state that does not exist yet cannot already exist, and matching its name
   * against every region in the subtree would adopt a same-named city from
   * another state.
   */
  parentId: number | null
}

export type NodeMatch =
  /** The node is a region the Atlas already holds; the commit writes nothing. */
  | { kind: 'existing'; regionId: number; name: string; slug: string | null }
  /** No existing region answers to it, so the commit creates one. */
  | { kind: 'create' }
  /** Its feature belongs to a region outside the target. See the header. */
  | { kind: 'elsewhere'; regionId: number; name: string }

/**
 * The existing region a proposed node is, or what to do instead.
 *
 * `existing` is scanned per node: both sides are tens of entries, so an index
 * would cost more reading than it saves.
 */
export function matchNode(node: MatchableNode, existing: readonly ExistingRegion[]): NodeMatch {
  const byId = node.mapboxId
    ? existing.find((region) => region.mapboxId === node.mapboxId)
    : undefined
  if (byId) {
    return byId.inTarget
      ? asExisting(byId)
      : { kind: 'elsewhere', regionId: byId.id, name: byId.name ?? String(byId.id) }
  }

  const name = comparableKey(node.name)
  if (name === null || node.parentId === null) return { kind: 'create' }

  // Level as well as parent: a state and a city can share both a name and a
  // parent country, and proposing the city must not adopt the state.
  const byName = existing.find(
    (region) =>
      region.inTarget &&
      region.parentId === node.parentId &&
      region.level === node.level &&
      comparableKey(region.name) === name,
  )
  return byName ? asExisting(byName) : { kind: 'create' }
}

function asExisting(region: ExistingRegion): NodeMatch {
  return {
    kind: 'existing',
    regionId: region.id,
    name: region.name ?? String(region.id),
    slug: region.slug ?? null,
  }
}
