/**
 * The two changes a reviewer may make to a proposed tree before committing it:
 * rename a node the commit would create, or say it is a region the Atlas
 * already holds.
 *
 * ⚠ **Pure, and the whole tree comes back.** `proposedRegions` is a closed
 * schema the commit walks (`EventImports.ts`), so an edit is a new tree rather
 * than a patch — which is what lets the re-slug and the prune below run over the
 * finished shape instead of guessing at the consequences of one change.
 *
 * ⚠ **Only a `create` node is editable.** An `existing` node is the Atlas's own
 * region, so its name is not ours to change and it is already mapped; an
 * `elsewhere` node's rows are errors the reviewer cannot clear from here
 * (`match.ts`). Both are refused by name rather than ignored, because an edit
 * silently dropped reads in the review as one that was applied.
 */

import { type ExistingRegion } from './match'
import { assignNodeSlugs, prunedOfEmptyStates, type ProposedNode, type ProposedTree } from './tree'

/** One change, addressed to a node by the key the proposal gave it. */
export type TreeEdit =
  | { kind: 'map'; key: string; regionId: number }
  | { kind: 'rename'; key: string; name: string }

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
    if (node.match.kind !== 'create') {
      return { ok: false, error: uneditable(node) }
    }

    const failure = edit.kind === 'rename' ? rename(node, edit.name) : map(node, edit, mappable)
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
    ? `"${node.name}" is already a region in the Atlas, so there is nothing to change here.`
    : `"${node.name}" exists outside this region of the Atlas, so it cannot be edited from here.`
}

/**
 * ⚠ **The name is trimmed and then has to still say something.** `slugifyValue`
 * falls back to the level for a name that slugifies to nothing (`slugs.ts`), so
 * a node renamed to a space would be created as "region" with no sign anything
 * went wrong.
 */
function rename(node: ProposedNode, name: string): null | string {
  const trimmed = name.trim()
  if (!trimmed) return `"${node.name}" needs a name.`
  node.name = trimmed
  return null
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
 * collection-wide namespace that nothing is going to claim.
 */
function map(
  node: ProposedNode,
  { regionId }: { regionId: number },
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

  node.match = {
    kind: 'existing',
    regionId,
    name: region.name ?? '',
    slug: region.slug ?? null,
  }
  node.parentKey = null
  node.slug = null
  node.location = null
  return null
}

/** The nodes the prune dropped, for the review to say so rather than lose them. */
function prunedKeys(before: readonly ProposedNode[], after: readonly ProposedNode[]): string[] {
  const keptKeys = new Set(after.map((node) => node.key))
  return before.filter((node) => !keptKeys.has(node.key)).map((node) => node.key)
}
