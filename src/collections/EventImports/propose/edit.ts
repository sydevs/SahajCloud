/**
 * The changes a reviewer may make to a proposed tree before committing it:
 * rename a node the commit would create, say it is a region the Atlas already
 * holds, or take that back.
 *
 * ⚠ **Pure, and the whole tree comes back.** `proposedRegions` is a closed
 * schema the commit walks (`EventImports.ts`), so an edit is a new tree rather
 * than a patch — which is what lets the re-slug and the prune below run over the
 * finished shape instead of guessing at the consequences of one change.
 *
 * ⚠ **Only a `create` node is renamed or mapped.** An `existing` node is the
 * Atlas's own region, so its name is not ours to change and it is already
 * mapped; an `elsewhere` node's rows are errors the reviewer cannot clear from
 * here (`match.ts`). Both are refused by name rather than ignored, because an
 * edit silently dropped reads in the review as one that was applied. The one
 * exception is `unmap`, and only for a node a `map` edit made `existing`.
 */

import { existingRegionLabel, type ExistingRegion } from './match'
import { assignNodeSlugs, prunedOfEmptyStates, type ProposedNode, type ProposedTree } from './tree'
import { comparableKey } from '../resolve/duplicates'

/** One change, addressed to a node by the key the proposal gave it. */
export type TreeEdit =
  | { kind: 'map'; key: string; regionId: number }
  | { kind: 'rename'; key: string; name: string }
  | { kind: 'unmap'; key: string }

/**
 * The longest name a rename may give, in characters once tidied.
 *
 * Longer than any place name a volunteer types, and short enough that the slug
 * and the review's tree row stay readable. The endpoint's own bound is on the
 * raw body and wider, because it counts what this strips.
 */
export const MAX_RENAMED_LENGTH = 100

export interface ApplyTreeEditsArgs {
  tree: ProposedTree
  edits: readonly TreeEdit[]
  /**
   * The regions a `map` edit may name: the target's subtree, which is the only
   * place this import may file a class. The caller reads it, because "inside the
   * target" is a tree read and this file does none.
   */
  mappable: readonly ExistingRegion[]
  /** The target's own name, the last disambiguator a top-level slug has. */
  targetName: string
  /** Every slug `regions` already holds, so a renamed node cannot collide. */
  takenSlugs: Iterable<string>
}

export type ApplyTreeEditsResult =
  | { ok: false; error: string }
  | { ok: true; tree: ProposedTree; pruned: string[] }

/**
 * The tree these edits leave behind, or the first reason none of them applied.
 *
 * ⚠ **All or nothing.** Half-applied edits would be stored and then rendered as
 * the reviewer's own tree, so a reviewer who mistyped one node would have to
 * work out which of their changes survived. The refusal names the node instead.
 *
 * ⚠ **`rowErrors` is carried over untouched, never recomputed.** The stored list
 * is the proposal's `elsewhere` rows *plus* the rows a city target confined away
 * (`endpoints/propose.ts`), and the second half is not derivable from the nodes —
 * so rebuilding it here would silently clear every row the target refused.
 */
export function applyTreeEdits({
  edits,
  mappable,
  takenSlugs,
  targetName,
  tree,
}: ApplyTreeEditsArgs): ApplyTreeEditsResult {
  const nodes = tree.nodes.map((node) => ({ ...node }))
  const byKey = new Map(nodes.map((node) => [node.key, node]))

  for (const edit of edits) {
    const node = byKey.get(edit.key)
    if (!node) return { ok: false, error: `This batch proposes no node called "${edit.key}".` }

    const failure =
      edit.kind === 'unmap'
        ? unmap(node, nodes)
        : node.match.kind !== 'create'
          ? uneditable(node)
          : edit.kind === 'rename'
            ? rename(node, edit.name, mappable)
            : map(node, edit, nodes, mappable)
    if (failure) return { ok: false, error: failure }
  }

  const kept = prunedOfEmptyStates(nodes)
  // After the edits, not per edit: a rename changes which slug a *sibling* can
  // have, and a mapping frees the one its node was holding.
  assignNodeSlugs(kept, targetName, takenSlugs)

  return {
    ok: true,
    tree: { ...tree, nodes: kept },
    pruned: prunedKeys(nodes, kept),
  }
}

/** Why a node the reviewer addressed is not theirs to change. */
function uneditable(node: ProposedNode): string {
  return node.match.kind === 'existing'
    ? `"${node.name}" already points at a region in the Atlas, so there is nothing to change here.`
    : `"${node.name}" exists outside this region of the Atlas, so it cannot be edited from here.`
}

/**
 * ⚠ **Invisible characters go before the blank check.** A zero-width space or a
 * bidi control survives `trim`, so a "name" of nothing but them reaches the
 * slug rule as a real one and the Atlas as a blank label. Joiners are kept
 * between letters, where Devanagari and Persian spell with them.
 *
 * ⚠ **A name the target already holds at this level is refused.** Renaming a
 * new Pune to "Pune" beside an existing one commits a duplicate with a
 * disambiguated slug, which is the mistake `map` exists to prevent.
 */
function rename(
  node: ProposedNode,
  name: string,
  mappable: readonly ExistingRegion[],
): null | string {
  const tidied = tidyName(name)
  if (!tidied) return `"${node.name}" needs a name.`
  if ([...tidied].length > MAX_RENAMED_LENGTH) {
    return `"${node.name}" can be renamed to at most ${MAX_RENAMED_LENGTH} characters.`
  }
  const key = comparableKey(tidied)
  const twin = mappable.find(
    (region) =>
      region.inTarget && region.level === node.level && comparableKey(region.name) === key,
  )
  if (twin) {
    return `"${existingRegionLabel(twin)}" is already a ${node.level} in this region of the Atlas. Map "${node.name}" onto it instead of renaming it.`
  }
  node.name = tidied
  return null
}

/** NFC, format characters dropped (joiners kept inside a word), whitespace collapsed. */
function tidyName(name: string): string {
  return name
    .normalize('NFC')
    .replace(/(?![\u200C\u200D])\p{Cf}/gu, '')
    .replace(/[\s\p{Z}]+/gu, ' ')
    .trim()
    .replace(/^[\u200C\u200D ]+|[\u200C\u200D ]+$/gu, '')
}

/**
 * Point a proposed node at a region that already exists.
 *
 * ⚠ **`parentKey` goes to null, the same as a node the proposal matched
 * itself.** The existing region keeps the parent it has — moving one is out of
 * scope — so naming a proposed state as its parent would promise a re-parenting
 * the commit does not perform (`tree.ts`). Nulling it is also what lets the
 * prune see a state that just lost its last child.
 *
 * ⚠ **`slug` and `location` go with it.** The commit writes neither for a node
 * it does not create, and a slug left behind would hold a name out of a
 * collection-wide namespace that nothing is going to claim. What they were is
 * kept in `before`, which is all an `unmap` restores from.
 *
 * ⚠ **Mapping a state re-matches the new cities under it.** The proposal
 * matched them while their state was new, when there were no children to find
 * them among — so a Munich under a Bayern the reviewer maps onto the Atlas's
 * Bavaria would be created beside Bavaria's own Munich.
 */
function map(
  node: ProposedNode,
  { regionId }: { regionId: number },
  nodes: readonly ProposedNode[],
  mappable: readonly ExistingRegion[],
): null | string {
  const region = mappable.find((candidate) => candidate.id === regionId)
  // ⚠ **`inTarget` is checked here, not left to the caller's `Where`.** The
  // propose step builds an `existing` list that deliberately carries regions
  // outside the target, for the refusal `match.ts` makes on them — so a second
  // caller handing that list to this function would otherwise permit exactly
  // the mapping the subtree read exists to prevent. The flag is load-bearing in
  // `matchNode` for the same reason; this makes the pure core self-defending
  // rather than sound by one call site.
  if (!region?.inTarget) {
    return `"${node.name}" can only be mapped to a region inside the one you are importing into.`
  }
  if (region.level !== node.level) {
    return `"${node.name}" is a ${node.level}, so it cannot be mapped to a ${region.level}.`
  }

  mapOnto(node, region)
  if (node.level !== 'region') return null

  for (const child of nodes) {
    if (child.parentKey !== node.key || child.match.kind !== 'create') continue
    const name = comparableKey(child.name)
    const twin = mappable.find(
      (candidate) =>
        candidate.inTarget &&
        candidate.parentId === regionId &&
        candidate.level === child.level &&
        comparableKey(candidate.name) === name,
    )
    if (twin) mapOnto(child, twin)
  }
  return null
}

function mapOnto(node: ProposedNode, region: ExistingRegion): void {
  node.before = { name: node.name, parentKey: node.parentKey, location: node.location }
  node.match = {
    kind: 'existing',
    regionId: region.id,
    // `match.ts` owns this label, because the control that offered this region
    // reads the same one — a blank or a second spelling would leave the review
    // unable to say which region the node was mapped onto.
    name: existingRegionLabel(region),
    slug: region.slug ?? null,
  }
  node.parentKey = null
  node.slug = null
  node.location = null
}

/**
 * Put a node a `map` edit made back to the proposal's `create`.
 *
 * ⚠ **Only a node carrying `before`.** One the proposal matched itself has no
 * proposal to go back to — its feature or name is the Atlas's, and creating it
 * would duplicate the region or fail `mapboxId`'s unique constraint.
 *
 * ⚠ **A parent the prune has since dropped is not restored with it.** The
 * state went because nothing under it was new, and only its own `unmap` could
 * say what it was; the node hangs off the target instead, which is where a city
 * the layer could not place goes anyway. The cities a state's mapping matched
 * stay matched — each is a region the Atlas holds — and unmap one at a time.
 */
function unmap(node: ProposedNode, nodes: readonly ProposedNode[]): null | string {
  const { before } = node
  if (node.match.kind !== 'existing' || !before) {
    return `"${node.name}" was not mapped in this review, so there is nothing to undo.`
  }
  node.match = { kind: 'create' }
  node.name = before.name
  node.parentKey = nodes.some((other) => other.key === before.parentKey) ? before.parentKey : null
  node.location = before.location
  delete node.before
  return null
}

/** The nodes the prune dropped, for the review to say so rather than lose them. */
function prunedKeys(before: readonly ProposedNode[], after: readonly ProposedNode[]): string[] {
  const keptKeys = new Set(after.map((node) => node.key))
  return before.filter((node) => !keptKeys.has(node.key)).map((node) => node.key)
}
