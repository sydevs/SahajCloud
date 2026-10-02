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
 * ⚠ **Pure, like the proposal it reads.** The commit resolves each created
 * node's real id as it goes and hands the growing map back in, so what a class
 * is filed under depends only on the tree and the ids already written.
 */

import type { ProposedNode } from '../propose/tree'

/** Deeper wins when two nodes both claim a line. */
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
  const seen = new Set<string>()
  for (const node of created) {
    if (node.parentKey !== null && !seen.has(node.parentKey)) {
      const parent = nodes.find((other) => other.key === node.parentKey)
      // A parent matched to an existing region is already there, so only a
      // *created* parent has to come first.
      if (parent?.match.kind === 'create') {
        throw new Error(`Proposed tree is not parent-first: ${node.key} precedes ${node.parentKey}`)
      }
    }
    seen.add(node.key)
  }
  return created
}

/**
 * The region ids the tree already knows, before anything is created.
 *
 * An `existing` match names the region it matched; a `create` one has no id yet
 * and an `elsewhere` one never gets one — its lines are already row errors
 * (`propose/tree.ts`).
 */
export function matchedRegionIds(nodes: readonly ProposedNode[]): Map<string, number> {
  const ids = new Map<string, number>()
  for (const node of nodes) {
    if (node.match.kind === 'existing') ids.set(node.key, node.match.regionId)
  }
  return ids
}

/**
 * The region a created node's parent is, or null when the commit cannot know yet.
 *
 * A node with no proposed parent hangs off the target, which is the one id that
 * is always in hand.
 */
export function parentRegionId(
  node: ProposedNode,
  nodes: readonly ProposedNode[],
  known: NodeRegionIds,
  targetId: number,
): number | null {
  if (node.parentKey === null) return targetId
  const parent = nodes.find((other) => other.key === node.parentKey)
  if (!parent) return null
  return parent.match.kind === 'existing' ? parent.match.regionId : (known.get(parent.key) ?? null)
}

/**
 * The region one row's class is filed under, or null when nothing holds it.
 *
 * Null is not an error on its own: a city target files a class with no shared
 * hall under the target itself, which is what the caller falls back to. A line
 * whose deepest node is `elsewhere` is already a row error and never reaches
 * here.
 */
export function regionForLine(
  line: number,
  nodes: readonly ProposedNode[],
  known: NodeRegionIds,
): number | null {
  let best: { depth: number; id: number } | null = null
  for (const node of nodes) {
    if (!node.lines.includes(line)) continue
    const id = node.match.kind === 'existing' ? node.match.regionId : known.get(node.key)
    if (id === undefined) continue
    const depth = LEVEL_DEPTH[node.level]
    if (!best || depth > best.depth) best = { depth, id }
  }
  return best?.id ?? null
}
