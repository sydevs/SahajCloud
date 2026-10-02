/**
 * What the review surface shows a reviewer, and what its commit loop decides.
 *
 * The two response shapes are declared against the server's own types, so a
 * field the endpoints rename fails here rather than rendering blank.
 *
 * ⚠ **The commit loop's bound lives here, not in the endpoint.** `commitVerdict`
 * is `resolveVerdict`'s counterpart (`runPlan.ts`): each chunk writes a class or
 * a reason onto every row it takes, so `pending` falls, and that fall is the only
 * thing that stops the loop. A chunk that wrote neither would spend the batch in
 * a tight loop against Postgres.
 */

import type { FinishOutcome } from '@/collections/EventImports/commit/finish'
import type { CommitTally } from '@/collections/EventImports/commit/summary'
import type { ExistingRegion } from '@/collections/EventImports/propose/match'
import type { ProposedNode, ProposedTree, TreeTally } from '@/collections/EventImports/propose/tree'
import type {
  CoordinatorTally,
  ReviewRow,
  ReviewRowCoordinator,
  ReviewRowStatus,
} from '@/collections/EventImports/review/rows'
import type { EventImport } from '@/payload-types'

/** One region a `map` edit may name, as `mappableRegions` answers it. */
export interface MappableRegion {
  id: number
  level: ExistingRegion['level']
  name: string
}

/** Everything `GET /:id/review` answers with. */
export interface ReviewAnswer extends TreeTally {
  warning?: string
  status: EventImport['status']
  target: { id: number; level: ExistingRegion['level']; name: string }
  proposedRegions: ProposedTree
  mappable: MappableRegion[]
  rows: ReviewRow[]
  coordinators: CoordinatorTally
}

/** Everything `POST /:id/commit` answers with, per chunk. */
export interface CommitChunk {
  warning?: string
  regions: { created: number; adopted: number; failed: number }
  coordinators: { matched: number; created: number; refused: number }
  rows: CommitTally
  committedNow: number
  pending: number
  done: boolean
  /** Present only on the call that finishes, which is the batch's last word. */
  finished?: FinishOutcome
}

export type CommitVerdict = 'commit' | 'done' | 'stalled'

/**
 * Whether the commit asks for another chunk, stops, or gives up.
 *
 * `previousPending` is null on the first chunk, which has nothing to compare to.
 */
export function commitVerdict(previousPending: null | number, latest: CommitChunk): CommitVerdict {
  if (latest.done) return 'done'
  if (previousPending !== null && latest.pending >= previousPending) return 'stalled'
  return 'commit'
}

export const COMMIT_STALLED_REFUSAL =
  'The commit stopped making progress. Reload this tab to see what it created, then ask an admin to look at the batch.'

export const DISCARD_CONFIRM =
  'Discard this batch? The classes it has not created yet are dropped. Nothing already in the Atlas is touched.'

/** Nodes by the node above them, so the tree renders as the proposal nested it. */
export function childrenByParent(
  nodes: readonly ProposedNode[],
): Map<null | string, ProposedNode[]> {
  const byParent = new Map<null | string, ProposedNode[]>()
  for (const node of nodes) {
    byParent.set(node.parentKey, [...(byParent.get(node.parentKey) ?? []), node])
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
 * ⚠ **`lines` counts the CSV lines the node holds, skipped ones included.** The
 * row table is where a reviewer reads how many become classes; a count narrowed
 * here would disagree with the proposal's own tally for no stated reason.
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
      ? `${stateLayer.unplacedCityKeys.length} cities could not be placed in a state, so they hang off the target.`
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
  if (rowErrors) parts.push(`${rowErrors} lines the regions cannot hold`)
  return `${parts.join(', ')}.`
}

/** How far the commit has got, while it is still running. */
export function commitProgressNote(latest: CommitChunk): string {
  const done = latest.rows.total - latest.pending
  return `Creating classes — ${done} of ${latest.rows.total}.`
}

/**
 * What the finished commit did.
 *
 * ⚠ **The batch is gone by the time this renders**, so the lines and reasons in
 * `finished` are the only account of the import anyone gets
 * (`commit/summary.ts`). This counts them; the surface lists them.
 */
export function commitDoneNote(finished: FinishOutcome, rows: CommitTally): string {
  const parts = [
    `${finished.committed.length} class${finished.committed.length === 1 ? '' : 'es'} created`,
    `${rows.verified} with a coordinator`,
    `${rows.unverified} unverified`,
  ]
  if (finished.skipped.length) parts.push(`${finished.skipped.length} lines skipped`)
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
