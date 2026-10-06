/**
 * Which existing region a proposed node already is, if any.
 *
 * The grouping steps (`cluster.ts`, `states.ts`) decide which rows belong
 * together without reading the region tree. This is the question that needs the
 * tree: a batch for a country the Atlas already holds cities in must land its
 * classes on those cities rather than propose second copies beside them.
 *
 * ⚠ **Two rules, in this order: the Mapbox id, then the name anywhere in the
 * target's subtree.** The id is the strong claim — one feature is one place,
 * whatever either side calls it, so it matches München to a node an
 * English-locale admin named Munich. The name is the fallback for the nodes that
 * have no id to match on: every region seeded by hand carries a `manual-` id of
 * its own (`src/lib/mapbox/manualLocation.ts`), which no geocode will ever
 * return.
 *
 * ⚠ **The name is searched across the subtree, not under one parent.** The tree
 * is mixed: a hand-seeded Pune under Maharashtra is the same Pune a batch for
 * India proposes straight under the country, and a parent-only search proposes
 * a second one beside it. What keeps that from adopting Springfield MO for
 * Springfield IL is the state each side sits in (`MatchContext`).
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

import { subdivisionCodeFor } from '@/lib/geography'
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
  /** ISO 3166-2 the node's classes sit in, which tells two same-named cities apart. */
  subdivisionCode?: string | null
}

/** What the name rule needs to know about the tree beyond each region's own row. */
export interface MatchContext {
  /**
   * The ISO 3166-2 code of the state an existing region sits in, or null when
   * it sits in none or the state's code cannot be told. `stateCodeResolver`
   * builds it.
   */
  subdivisionOf?: (region: ExistingRegion) => string | null
}

export type NodeMatch =
  /** The node is a region the Atlas already holds; the commit writes nothing. */
  | { kind: 'existing'; regionId: number; name: string; slug: string | null }
  /** No existing region answers to it, so the commit creates one. */
  | { kind: 'create' }
  /**
   * Its feature belongs to a region it cannot be: one outside the target (see
   * the header), or one at another level (`matchNode`).
   */
  | { kind: 'elsewhere'; regionId: number; name: string }

/**
 * The existing region a proposed node is, or what to do instead.
 *
 * `existing` is scanned per node: both sides are tens of entries, so an index
 * would cost more reading than it saves.
 *
 * ⚠ **An id match at another level is a conflict, never a match.** The Atlas
 * seed gave some city-states a `region`-level node on the city's own feature
 * (Berlin on `place.berlin`), so the city a batch proposes finds the state. A
 * match would file every class under a state, which the commit refuses row by
 * row, and leave the reviewer an `existing` node they cannot edit; a create
 * would fail `mapboxId`'s unique constraint. So its rows are errors instead,
 * which `rowErrorsFor` (`tree.ts`) words for this case.
 *
 * ⚠ **The name rule refuses to guess.** A candidate in a known state other than
 * the node's own is never adopted, and of several left, one in the node's own
 * state is taken only when it is the only one. Two same-named cities with
 * nothing to tell them apart are a create the reviewer can map, rather than
 * classes silently filed in the wrong town.
 */
export function matchNode(
  node: MatchableNode,
  existing: readonly ExistingRegion[],
  { subdivisionOf = () => null }: MatchContext = {},
): NodeMatch {
  const byId = node.mapboxId
    ? existing.find((region) => region.mapboxId === node.mapboxId)
    : undefined
  if (byId) {
    return byId.inTarget && byId.level === node.level
      ? asExisting(byId)
      : { kind: 'elsewhere', regionId: byId.id, name: byId.name ?? String(byId.id) }
  }

  const name = comparableKey(node.name)
  if (name === null) return { kind: 'create' }

  // Level as well as name: a state and a city can share a name, and proposing
  // the city must not adopt the state.
  const code = node.subdivisionCode?.trim().toUpperCase() || null
  const candidates = existing.filter((region) => {
    if (!region.inTarget || region.level !== node.level) return false
    if (comparableKey(region.name) !== name) return false
    const state = subdivisionOf(region)
    return !code || !state || state === code
  })
  const sameState = code ? candidates.filter((region) => subdivisionOf(region) === code) : []
  const pick = sameState.length ? sameState : candidates
  return pick.length === 1 ? asExisting(pick[0]!) : { kind: 'create' }
}

/** A state the proposal wants, before it is known whether the Atlas holds it. */
export interface MatchableState {
  /** ISO 3166-2 code, as `decideStateLayer` grouped it. */
  code: string
  /** ISO's name for it — usually the endonym, so Bayern and not Bavaria. */
  name: string
  /** The Mapbox `region` features its cities' rows geocoded into. */
  mapboxIds: readonly string[]
}

/**
 * The state-level region in the target a proposed state already is, if any.
 *
 * ⚠ **Three rules, because ISO's name is the weakest of them.** ISO lists the
 * endonym, so a state the Atlas calls Bavaria never matches Bayern by name —
 * and the miss is a second Bavaria with a second copy of every city under it.
 * The Mapbox region feature names it whatever either side calls it; the code
 * read off the region's own name or slug (`stateCodeResolver`) covers a
 * hand-seeded one with no feature; ISO's name is the last resort.
 *
 * A region outside the target is never matched. A created state is
 * hand-located (`tree.ts`), so a feature held elsewhere conflicts with nothing.
 */
export function matchState(
  state: MatchableState,
  existing: readonly ExistingRegion[],
  codeOf: (region: ExistingRegion) => string | null,
): NodeMatch {
  const regions = existing.filter((region) => region.inTarget && region.level === 'region')
  const name = comparableKey(state.name)
  const found =
    regions.find((region) => !!region.mapboxId && state.mapboxIds.includes(region.mapboxId)) ??
    regions.find((region) => codeOf(region) === state.code) ??
    regions.find((region) => name !== null && comparableKey(region.name) === name)
  return found ? asExisting(found) : { kind: 'create' }
}

export interface StateCodeArgs {
  existing: readonly ExistingRegion[]
  /** The target country's ISO alpha-2. */
  countryCode: string
  /** Which subdivision each Mapbox `region` feature the batch geocoded into is. */
  featureCodes: ReadonlyMap<string, string>
}

/**
 * The ISO 3166-2 code each state-level region stands for, and the code of the
 * state any region sits in — the two questions the name rules above ask.
 *
 * A state-level region's own code comes from its Mapbox feature, where a row of
 * this batch geocoded into it, and otherwise from its name or slug
 * (`subdivisionCodeFor`). Memoised, because the walk is asked per candidate.
 */
export function stateCodeResolver({ existing, countryCode, featureCodes }: StateCodeArgs): {
  codeOf: (region: ExistingRegion) => string | null
  subdivisionOf: (region: ExistingRegion) => string | null
} {
  const byId = new Map(existing.map((region) => [region.id, region]))
  const codes = new Map<number, string | null>()

  const codeOf = (region: ExistingRegion): string | null => {
    if (region.level !== 'region') return null
    if (!codes.has(region.id)) {
      const fromFeature = region.mapboxId ? featureCodes.get(region.mapboxId) : undefined
      codes.set(
        region.id,
        fromFeature?.toUpperCase() ??
          subdivisionCodeFor(countryCode, region.name) ??
          subdivisionCodeFor(countryCode, region.slug),
      )
    }
    return codes.get(region.id)!
  }

  const subdivisionOf = (region: ExistingRegion): string | null => {
    // Bounded by the list: a parent outside it ends the walk, and so would a
    // cycle, which `Regions` refuses but this need not trust.
    const seen = new Set<number>()
    let at = region.parentId === null ? undefined : byId.get(region.parentId)
    while (at && !seen.has(at.id)) {
      seen.add(at.id)
      if (at.level === 'region') return codeOf(at)
      if (at.level === 'country') return null
      at = at.parentId === null ? undefined : byId.get(at.parentId)
    }
    return null
  }

  return { codeOf, subdivisionOf }
}

function asExisting(region: ExistingRegion): NodeMatch {
  return {
    kind: 'existing',
    regionId: region.id,
    name: existingRegionLabel(region),
    slug: region.slug ?? null,
  }
}

/**
 * What to call a region the Atlas already holds, wherever one is shown.
 *
 * ⚠ **One definition, because the review offers a region by one label and then
 * shows the node carrying another.** The mapping control lists candidates and
 * `applyTreeEdits` writes the chosen one's name onto the node (`edit.ts`), so two
 * spellings put two names for one region on the same screen.
 *
 * ⚠ **The slug before the id, and `||` rather than `??`.** `Regions.name` is
 * optional and some hand-seeded regions have none, so a label is needed either
 * way — but the slug is one a volunteer can read and `Regions` requires it.
 * `??` was the old spelling and it passes an empty or blank name straight
 * through, which is the blank label this exists to prevent.
 */
export function existingRegionLabel(region: ExistingRegion): string {
  return region.name?.trim() || region.slug || String(region.id)
}
