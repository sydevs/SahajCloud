/**
 * Which region each committed class lands in, and which proposed nodes have to
 * be created first.
 *
 * ⚠ **A node's `lines` are not its classes.** A state carries every line of
 * every city beneath it (`propose/tree.ts`), so the shallowest match is almost
 * always wrong — a Munich class whose state layer was proposed would be filed
 * directly under Bavaria. The deepest node holding the line is the answer, and
 * `LEVEL_DEPTH` is what orders them.
 *
 * ⚠ **Pure, like the proposal it reads.** One map carries every region a node
 * stands for: `matchedRegionIds` seeds it with the regions the Atlas already
 * holds, and the commit adds each one it creates. So what a class is filed under
 * depends only on the tree and on what has been written so far — and there is one
 * place a node's region comes from rather than three.
 */

import type { ProposedNode } from '../propose/tree'

/**
 * Deeper wins when two nodes both claim a line.
 *
 * Typed against the level union rather than derived from `REGION_LEVEL_OPTIONS`,
 * which would pull the whole `Regions` config into a module the unit lane loads —
 * the constraint `lib/atlasSidebar/sidebarModel.ts` documents for its own level
 * table. Inserting a level is a compile error here either way. TODO: one home for
 * the hierarchy, read by `Regions`, the sidebar and this.
 */
const LEVEL_DEPTH: Record<ProposedNode['level'], number> = { region: 1, city: 2, venue: 3 }

/** A proposed node's key mapped to the region it stands for, once that is known. */
export type NodeRegionIds = ReadonlyMap<string, number>

/**
 * The nodes the commit creates, in the order it may create them.
 *
 * ⚠ **Parent-first is `buildProposedTree`'s guarantee, re-asserted rather than
 * re-derived.** A topological sort here would be a second opinion on the order,
 * and the two disagreeing is a city created under a state that does not exist
 * yet — which Postgres answers with a foreign-key error naming neither node. So
 * a tree that is not parent-first is refused outright.
 */
export function creatableNodes(nodes: readonly ProposedNode[]): ProposedNode[] {
  const created = nodes.filter((node) => node.match.kind === 'create')
  const createdKeys = new Set(created.map((node) => node.key))
  const seen = new Set<string>()
  for (const node of created) {
    // Only a parent this commit also creates has to come first; one the Atlas
    // already holds is there whatever the order.
    if (node.parentKey && createdKeys.has(node.parentKey) && !seen.has(node.parentKey)) {
      throw new Error(`Proposed tree is not parent-first: ${node.key} precedes ${node.parentKey}`)
    }
    seen.add(node.key)
  }
  return created
}

/**
 * The seed for the commit's region map: every node the Atlas already holds.
 *
 * A `create` node has no id until the commit writes it, and an `elsewhere` one
 * never gets one — its lines are already row errors (`propose/tree.ts`).
 */
export function matchedRegionIds(nodes: readonly ProposedNode[]): Map<string, number> {
  const ids = new Map<string, number>()
  for (const node of nodes) {
    if (node.match.kind === 'existing') ids.set(node.key, node.match.regionId)
  }
  return ids
}

/**
 * The region a created node's parent is, or null when it is not written yet.
 *
 * A node with no proposed parent hangs off the target, which is the one id that
 * is always in hand.
 */
export function parentRegionId(
  node: ProposedNode,
  known: NodeRegionIds,
  targetId: number,
): number | null {
  if (node.parentKey === null) return targetId
  return known.get(node.parentKey) ?? null
}

/**
 * Where one row's class goes.
 *
 * ⚠ **Three answers, because two of them are not a region id.** `target` is
 * ordinary — a city target files a class with no shared hall under the target
 * itself. `pending` is not: the node that holds the line exists in the tree and
 * has no region, which means its create failed or it is held elsewhere.
 * Collapsing that into "use the ancestor" is the defect the deepest-node rule
 * exists to prevent, arrived at by another route — a Munich class filed under
 * Bavaria, indistinguishable from a correct placement once it is an `id`.
 */
export type Placement =
  | { kind: 'region'; regionId: number }
  | { kind: 'target' }
  | { kind: 'pending'; node: ProposedNode }

export function placeLine(
  line: number,
  nodes: readonly ProposedNode[],
  known: NodeRegionIds,
): Placement {
  const node = deepestNodeFor(line, nodes)
  if (!node) return { kind: 'target' }
  const regionId = known.get(node.key)
  return regionId === undefined ? { kind: 'pending', node } : { kind: 'region', regionId }
}

/**
 * ⚠ **Decided before any id is consulted, so an uncreated node cannot be
 * skipped past.** Reading the map first and taking the deepest node that happens
 * to have one is how the ancestor becomes the answer.
 */
function deepestNodeFor(line: number, nodes: readonly ProposedNode[]): ProposedNode | null {
  let best: ProposedNode | null = null
  for (const node of nodes) {
    if (!node.lines.includes(line)) continue
    if (!best || LEVEL_DEPTH[node.level] > LEVEL_DEPTH[best.level]) best = node
  }
  return best
}
