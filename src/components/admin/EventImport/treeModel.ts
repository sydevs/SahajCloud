/**
 * What the region tree says about one proposed node, and which edits it offers.
 *
 * Pure, so the wording and the "may this be edited" rule are unit-testable
 * without a DOM. Every predicate here answers the same question
 * `propose/edit.ts` answers on the write side — offering a control that
 * `applyTreeEdits` then refuses reads as the control being broken.
 */

import type { ExistingRegion } from '@/collections/EventImports/propose/match'
import type { ProposedNode } from '@/collections/EventImports/propose/tree'

/**
 * Nodes by the node above them, so the tree renders as the proposal nested it.
 *
 * ⚠ **A node whose parent is gone is adopted by the root, never dropped.**
 * `prunedOfEmptyStates` keeps a state only while some child would be created,
 * and a city matched `elsewhere` keeps its parent's key — so a state whose every
 * city the Atlas already holds outside the target is pruned out from under them.
 * The renderer walks down from the root, so a node keyed on an absent parent
 * would be in the tree and on no screen: the one region whose refusal the
 * reviewer needs to see, silently missing.
 */
export function childrenByParent(
  nodes: readonly ProposedNode[],
): Map<null | string, ProposedNode[]> {
  const present = new Set(nodes.map((node) => node.key))
  const byParent = new Map<null | string, ProposedNode[]>()
  for (const node of nodes) {
    const parent = node.parentKey !== null && present.has(node.parentKey) ? node.parentKey : null
    const siblings = byParent.get(parent)
    if (siblings) siblings.push(node)
    else byParent.set(parent, [node])
  }
  return byParent
}

/** Whether a reviewer may rename this node or map it onto a region. */
export function isEditableNode(node: ProposedNode): boolean {
  return node.match.kind === 'create'
}

/** Whether the reviewer mapped this node themselves, and so may take it back. */
export function isUnmappableNode(node: ProposedNode): boolean {
  return node.match.kind === 'existing' && !!node.before
}

/** What the node is, in the words its own match uses. */
export function nodeMatchNote(node: ProposedNode): string {
  if (node.match.kind === 'existing') return `already in the Atlas — ${node.match.name}`
  if (node.match.kind === 'elsewhere') {
    return `already used elsewhere in the Atlas — ${node.match.name}`
  }
  return 'new'
}

/**
 * How many classes file into this node.
 *
 * ⚠ **The proposal's own count, never a second reading of it.** `proposableRows`
 * has already dropped the errored, duplicate and unresolved lines, so a `create`
 * node's lines are the classes it will file — while an `elsewhere` node's are
 * exactly its `rowErrors`. Narrowing this would disagree with the tally the same
 * tree produced, for no stated reason.
 */
export function nodeCountNote(node: ProposedNode): string {
  const count = node.lines.length
  return `${count} ${count === 1 ? 'line' : 'lines'}`
}

/** The places the metro rule folded into this city, or null where it folded none. */
export function mergedNote(node: ProposedNode): null | string {
  const names = (node.merged ?? []).map(({ name }) => name).filter(Boolean)
  return names.length ? `includes ${names.join(', ')}` : null
}

/**
 * The regions this node may be mapped onto.
 *
 * The wrapper already filtered the list to the target's subtree; this narrows it
 * to the node's own level, because a city mapped onto a state is a refusal the
 * reviewer was invited to make.
 */
export function mappableFor(
  mappable: readonly ExistingRegion[],
  node: ProposedNode,
): ExistingRegion[] {
  return mappable.filter((region) => region.level === node.level)
}

/**
 * The slug namespace a rename has to miss.
 *
 * ⚠ **The target's subtree plus the proposal's own, not the whole collection.**
 * `Regions.slug` is unique collection-wide, so this is deliberately incomplete —
 * and it is safe to be, because the commit re-checks every slug against the live
 * collection and re-slugs rather than failing (`commit/regions.ts`). Shipping
 * every region's slug to the browser to pre-empt a collision the commit already
 * recovers from would pay for it on every page load.
 */
export function takenSlugsFor(
  mappable: readonly ExistingRegion[],
  nodes: readonly ProposedNode[],
): string[] {
  return [
    ...mappable.map((region) => region.slug),
    ...nodes.map((node) => node.slug),
  ].filter((slug): slug is string => !!slug)
}
