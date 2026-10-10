/**
 * What a reviewer may change about a batch while it waits for them, and nothing
 * else.
 *
 * ⚠ **This is a write refusal, not a form nicety.** `rows` and `proposedRegions`
 * carry only `admin.readOnly`, and the uploader holds document-level `update`
 * through the `manager` field (`EventImports.ts`) — so a `PATCH` could otherwise
 * rewrite every row within the Ajv schema and the commit job would trust it. The
 * job dispatches on `rows[].resolved` and `rows[].committed.eventId`, which means
 * an unchecked delta is a way to file a class under any region id and claim an
 * exactly-once key for a class nobody imported.
 *
 * ⚠ **Nodes and rows are matched by identity, never by index.** A reviewer's map
 * edit re-prunes the tree (`propose/edit.ts`), so a node legitimately disappears
 * from the middle of the array — and an index-wise diff then reports every node
 * after it as changed. So the delta is taken per node by `key` and per row by
 * `line`, and `microdiff` compares the pair.
 *
 * ⚠ **A key the batch does not propose cannot be introduced.** Adding a node is
 * how a reviewer would otherwise name a region the proposal never saw, which the
 * commit creates without the subtree checks the proposal ran.
 */

import diff from 'microdiff'

import type { EventImportProposedRegions, EventImportRows } from '@/payload-types'

type ImportRow = EventImportRows[number]

/**
 * The node keys a review may differ on.
 *
 * `name` and `match` are the two edits the review offers. The other three travel
 * with them and are not separately offered: `mapNode` nulls `slug`, `parentKey`
 * and `location` and records what they were in `before`, `unmapNode` restores
 * them from it, and a rename re-runs `assignNodeSlugs` over every sibling
 * (`propose/edit.ts`). Omitting one would refuse the edit it is half of.
 *
 * ⚠ **`key`, `level`, `lines` and `merged` are deliberately absent.** `lines` is
 * what files a row's class under this node, and `level` is what the commit
 * checks an adopted region against — both are the proposal's own answers about
 * the rows, not opinions a review may hold.
 */
const EDITABLE_NODE_KEYS: ReadonlySet<string> = new Set([
  'name',
  'match',
  'before',
  'slug',
  'parentKey',
  'location',
])

/** The only thing about a row a review decides. */
const EDITABLE_ROW_PATH = ['duplicate', 'action'] as const

/** The first reason the submitted value is not the stored one plus a review's edits. */
export type EditRefusal = null | string

/**
 * Whether the submitted value is the stored one, unchanged.
 *
 * ⚠ **Needed because Payload back-fills an omitted column.** By the time a
 * collection `beforeChange` hook runs, `data` carries every field of the stored
 * document whether or not the patch named it — so presence says nothing, and
 * "did the caller touch this column" can only be answered by comparing.
 */
export function isUnchanged(stored: unknown, submitted: unknown): boolean {
  if (isEmpty(stored) && isEmpty(submitted)) return true
  if (isEmpty(stored) || isEmpty(submitted)) return false
  return diff(stored as object, submitted as object).length === 0
}

/** What Payload's own json validator treats as "no value" for a JSON column. */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  return Array.isArray(value) ? value.length === 0 : Object.keys(value as object).length === 0
}

/**
 * Whether these are the stored rows with at most a duplicate decision changed.
 *
 * A row may neither appear nor disappear: the rows are the file, and the file
 * only changes by re-uploading it.
 */
export function refuseRowEdits(
  stored: readonly ImportRow[],
  submitted: readonly ImportRow[],
): EditRefusal {
  if (submitted.length !== stored.length) {
    return 'The rows of an import cannot be added to or removed — upload a corrected file instead.'
  }

  const byLine = new Map(stored.map((row) => [row.line, row]))
  for (const row of submitted) {
    const before = byLine.get(row.line)
    if (!before) return `This import has no line ${row.line}.`
    for (const change of diff(before, row)) {
      if (!isRowDecision(change.path)) {
        return `Line ${row.line}: only the skip-or-import choice on a duplicate can be changed here.`
      }
      if (change.type !== 'REMOVE' && !isDuplicateAction(change.value)) {
        return `Line ${row.line}: a duplicate is either skipped or imported.`
      }
    }
  }
  return null
}

/**
 * Whether this is the stored tree with at most a review's renames and mappings
 * applied.
 *
 * ⚠ **`rowErrors` and `stateLayer` must match exactly.** Both are the proposal's
 * account of what it could not do, which the commit folds onto the rows it
 * refuses (`CommitEventImport`) and the review has to show — so a reviewer who
 * could clear them would commit rows the proposal had already ruled out.
 */
export function refuseTreeEdits(
  stored: EventImportProposedRegions,
  submitted: EventImportProposedRegions,
): EditRefusal {
  for (const change of diff(
    { rowErrors: stored.rowErrors, stateLayer: stored.stateLayer },
    { rowErrors: submitted.rowErrors, stateLayer: submitted.stateLayer },
  )) {
    return `The proposal's own ${String(change.path[0])} cannot be edited here.`
  }

  const byKey = new Map(stored.nodes.map((node) => [node.key, node]))
  for (const node of submitted.nodes) {
    const before = byKey.get(node.key)
    // A node the submitted tree introduces is one the proposal never checked
    // against the target's subtree.
    if (!before) return `This batch proposes no region called "${node.name}".`
    for (const change of diff(before, node)) {
      const field = change.path[0]
      if (typeof field !== 'string' || !EDITABLE_NODE_KEYS.has(field)) {
        return `"${before.name}": only renaming it, or pointing it at a region the Atlas already holds, can be changed here.`
      }
    }
  }
  return null
}

/** `duplicate.action`, and nothing deeper or shallower. */
function isRowDecision(path: readonly (string | number)[]): boolean {
  return path.length === EDITABLE_ROW_PATH.length && path.every((key, at) => key === EDITABLE_ROW_PATH[at])
}

function isDuplicateAction(value: unknown): boolean {
  return value === 'skip' || value === 'import'
}
