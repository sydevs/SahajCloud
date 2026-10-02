/**
 * What the review surface shows a reviewer, and what its commit loop decides.
 *
 * ⚠ **Neither response is parsed.** The surface casts both bodies, so a field an
 * endpoint renames is `undefined` at runtime, not a compile error. What these
 * declarations do buy is that every member type is the server's own — rename a
 * field inside `ProposedTree`, `CommitTally` or `FinishOutcome` and the
 * destructuring sites fail to compile.
 *
 * ⚠ **The commit loop's bound lives here, not in the endpoint.** `commitVerdict`
 * is `resolveVerdict`'s counterpart (`runPlan.ts`): each chunk writes a class or a
 * reason onto every row it takes, so `pending` falls, and watching it fall is all
 * the loop has to go on. A chunk that wrote neither would spend the batch in a
 * tight loop against Postgres, so termination is decided here rather than left to
 * the endpoint's good behaviour.
 */

import type { FinishOutcome } from '@/collections/EventImports/commit/finish'
import type { CommitTally } from '@/collections/EventImports/commit/summary'
import type { ProposedNode, ProposedTree, TreeTally } from '@/collections/EventImports/propose/tree'
import type {
  CoordinatorTally,
  MappableRegion,
  ReviewRow,
  ReviewRowCoordinator,
  ReviewRowStatus,
} from '@/collections/EventImports/review/rows'
import type { EventImport } from '@/payload-types'

export type { MappableRegion }

/**
 * What the surface reads out of `GET /:id/review`.
 *
 * ⚠ **Only the fields it reads.** The endpoint answers more — the target, the
 * counts per step — and declaring one the surface never renders would be a shape
 * claiming to be checked while nothing could fail.
 */
export interface ReviewAnswer extends TreeTally {
  warning?: string
  status: EventImport['status']
  proposedRegions: ProposedTree
  mappable: MappableRegion[]
  rows: ReviewRow[]
  coordinators: CoordinatorTally
}

/** What the surface reads out of each `POST /:id/commit` chunk. */
export interface CommitChunk {
  warning?: string
  rows: CommitTally
  pending: number
  done: boolean
  /** Present only on the call that finishes, which is the batch's last word. */
  finished?: FinishOutcome
}

/** The one chunk that carries the batch's last word, which the outcome renders. */
export type FinishedChunk = CommitChunk & { finished: FinishOutcome }

export type CommitVerdict = 'commit' | 'done' | 'stalled'

/**
 * Whether the commit asks for another chunk, stops, or gives up.
 *
 * `previousPending` is null on the first chunk, which has nothing to compare to.
 */
export function commitVerdict(previousPending: null | number, latest: CommitChunk): CommitVerdict {
  if (latest.done) return 'done'
  // ⚠ **A chunk that reports no count is a stall, not a licence to continue.** A
  // 200 whose body carries no `pending` — an edge or a proxy answering `{}` —
  // leaves every comparison `undefined >= undefined`, which is false forever. The
  // falling count is all this has to go on, so a chunk that does not report one
  // ends the loop rather than feeding it.
  if (typeof latest.pending !== 'number') return 'stalled'
  if (typeof previousPending === 'number' && latest.pending >= previousPending) return 'stalled'
  return 'commit'
}

export const COMMIT_STALLED_REFUSAL =
  'The commit stopped making progress. Reload this tab to see what it created, then ask an admin to look at the batch.'

export const DISCARD_CONFIRM =
  'Discard this batch? The classes it has not created yet are dropped. Nothing already in the Atlas is touched.'

/**
 * Nodes by the node above them, so the tree renders as the proposal nested it.
 *
 * ⚠ **A node whose parent is gone is adopted by the root, never dropped.**
 * `prunedOfEmptyStates` keeps a state only while some child would be created, and
 * a city matched `elsewhere` keeps its parent's key — so a state whose every city
 * the Atlas already holds outside the target is pruned out from under them. The
 * renderer walks down from the root, so a node keyed on an absent parent would be
 * in the tree and on no screen: the one region whose refusal the reviewer needs to
 * see, silently missing.
 */
export function childrenByParent(
  nodes: readonly ProposedNode[],
): Map<null | string, ProposedNode[]> {
  const present = new Set(nodes.map((node) => node.key))
  const byParent = new Map<null | string, ProposedNode[]>()
  for (const node of nodes) {
    const parent =
      node.parentKey !== null && present.has(node.parentKey) ? node.parentKey : null
    const siblings = byParent.get(parent)
    if (siblings) siblings.push(node)
    else byParent.set(parent, [node])
  }
  return byParent
}

/**
 * Whether a reviewer may rename this node or map it onto a region.
 *
 * ⚠ **The same test `applyTreeEdits` makes** (`propose/edit.ts`): an `existing`
 * node is the Atlas's own region and an `elsewhere` node's rows are errors the
 * reviewer cannot clear from here. Offering a control either one refuses reads as
 * the control being broken.
 */
export function isEditableNode(node: ProposedNode): boolean {
  return node.match.kind === 'create'
}

/** What the node is, in the words its own match uses. */
export function nodeMatchNote(node: ProposedNode): string {
  if (node.match.kind === 'existing') return `already in the Atlas — ${node.match.name}`
  if (node.match.kind === 'elsewhere') return `managed elsewhere — ${node.match.name}`
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
 * The endpoint already filtered the list to the levels the tree holds; this
 * narrows it to the one node, because a city mapped onto another batch's state
 * is a 422 the reviewer was invited to make.
 */
export function mappableFor(
  mappable: readonly MappableRegion[],
  node: ProposedNode,
): MappableRegion[] {
  return mappable.filter((region) => region.level === node.level)
}

/**
 * Why the batch has no state layer, where it has none.
 *
 * ⚠ **A missing layer needs explaining, or it reads as a fault.** A country
 * batch under either threshold proposes its cities directly, which is correct and
 * looks like the grouping silently failed.
 */
export function stateLayerNote(tree: ProposedTree): null | string {
  const { stateLayer } = tree
  if (stateLayer.proposed) {
    return stateLayer.unplacedCityKeys.length
      ? `${stateLayer.unplacedCityKeys.length} ${stateLayer.unplacedCityKeys.length === 1 ? 'city' : 'cities'} could not be placed in a state, so ${stateLayer.unplacedCityKeys.length === 1 ? 'it hangs' : 'they hang'} off the target.`
      : null
  }
  return `No state layer: ${stateLayer.reason}`
}

/**
 * What the commit will do about coordinator accounts.
 *
 * ⚠ **Nothing about an existing account but that it exists.** The endpoint
 * answers two numbers for exactly this reason (`review/rows.ts`), so the wording
 * stays neutral — no name, role or region of anyone the Atlas already holds.
 */
export function coordinatorNote({ created, existing }: CoordinatorTally): string {
  const parts: string[] = []
  if (created) parts.push(`${created} new coordinator${created === 1 ? '' : 's'} will be created`)
  if (existing)
    parts.push(`${existing} address${existing === 1 ? '' : 'es'} already has an account`)
  return parts.length ? `${parts.join('; ')}.` : 'No row names a coordinator.'
}

/** What the tree comes to, in the order a reviewer reads it. */
export function treeNote({ creating, existing, rowErrors }: TreeTally): string {
  const parts = [`${creating} new region${creating === 1 ? '' : 's'}`]
  if (existing) parts.push(`${existing} already in the Atlas`)
  if (rowErrors)
    parts.push(`${rowErrors} line${rowErrors === 1 ? '' : 's'} the regions cannot hold`)
  return `${parts.join(', ')}.`
}

/**
 * How far the commit has got, while it is still running.
 *
 * ⚠ **Classes created, then lines left — not a fraction of the file.**
 * `rows.total` counts every CSV line and `pending` only the committable ones, so
 * "80 of 100" would read as 80 classes on a batch that had created 20 and skipped
 * 60 duplicates.
 */
export function commitProgressNote(latest: CommitChunk): string {
  const created = `${latest.rows.committed} class${latest.rows.committed === 1 ? '' : 'es'} created`
  return latest.pending ? `${created}, ${latest.pending} lines to go.` : `${created}.`
}

/**
 * What the finished commit did.
 *
 * ⚠ **The batch is gone by the time this renders**, so the lines and reasons in
 * `finished` are the only account of the import anyone gets
 * (`commit/summary.ts`). This counts them; the surface lists them.
 */
export function commitDoneNote({ finished, rows }: FinishedChunk): string {
  const parts = [
    `${finished.committed.length} class${finished.committed.length === 1 ? '' : 'es'} created`,
    `${rows.verified} with a coordinator`,
    `${rows.unverified} unverified`,
  ]
  const { length: skipped } = finished.skipped
  if (skipped) parts.push(`${skipped} line${skipped === 1 ? '' : 's'} skipped`)
  return `${parts.join(', ')}.`
}

export const ROW_STATUS_LABEL: Record<ReviewRowStatus, string> = {
  committed: 'Already created',
  duplicate: 'Duplicate — skipped',
  error: 'Skipped',
  pending: 'Not checked yet',
  ready: 'Will be created',
}

export const COORDINATOR_LABEL: Record<ReviewRowCoordinator, string> = {
  existing: 'Existing account',
  new: 'New coordinator — will be created',
  none: 'No coordinator',
}
