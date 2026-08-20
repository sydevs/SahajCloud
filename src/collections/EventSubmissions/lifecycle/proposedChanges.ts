import type { FlattenedField } from 'payload'

import { diffWords } from 'diff'
import diff from 'microdiff'
import { toWords } from 'payload/shared'

import { lexicalPlainText } from '@/lib/eventQuality'

/**
 * What a submission would change, field by field — the reviewer's whole job in
 * one list.
 *
 * The comparison itself is `microdiff` (already a dependency, 4 KB): it walks
 * two objects and reports typed CREATE / REMOVE / CHANGE entries with a path
 * array. Everything here is the part microdiff can't know — which paths are
 * noise, what a field is called, and how to render a value a human can judge.
 *
 * Pure and server-side. Computed in the `proposedChanges` virtual field's
 * `afterRead` because that is the only place both sides exist: the reviewer's
 * browser has the proposal but not the event it would land on.
 */

/** A run of text within a word-level diff of one long value. */
export interface DiffSegment {
  text: string
  kind: 'same' | 'added' | 'removed'
}

/** One field's before/after, already formatted for display. */
export interface ProposedChange {
  /** Dotted path, e.g. `schedule.firstDate`. Stable key for React. */
  path: string
  /** Human label from the Events field config, e.g. `Schedule › First Date`. */
  label: string
  kind: 'added' | 'changed' | 'removed'
  before: string | null
  after: string | null
  /**
   * Word-level diff of `before` → `after`, for values long enough that showing
   * both in full buries the edit. Absent for short values, where two lines are
   * already the clearest thing to read.
   */
  segments?: DiffSegment[]
  /**
   * This entry is a rendered group (`key: value` lines), not prose — so the
   * renderer can emphasise the keys. Flagged here rather than sniffed from the
   * text, which would mistake any multi-line description for a group.
   */
  block?: true
}

/**
 * Values at least this long get a word-level diff instead of two whole lines.
 * A phone number or a venue name is quicker to compare side by side; a
 * paragraph of description is not.
 */
const WORD_DIFF_MIN_LENGTH = 60

/**
 * Word-level diff of two long values.
 *
 * `diffWords` from `diff` (jsdiff) rather than a character-level differ:
 * character diffs shred prose into single letters — an edit from "main hall"
 * to "annexe building" came back as `m`/`a`/`i`/`n`/`n`/`exe`, which is
 * unreadable. This runs server-side, in the `proposedChanges` afterRead, so
 * the package never reaches the admin bundle.
 */
function wordSegments(before: string, after: string): DiffSegment[] {
  return diffWords(before, after).map((part) => ({
    text: part.value,
    kind: part.added ? 'added' : part.removed ? 'removed' : 'same',
  }))
}

/**
 * Bookkeeping a reviewer can't act on. `id`/`_status` are not proposable
 * (see `validateProposal`), and the timestamps differ on every read.
 */
const OMITTED_ROOTS = new Set(['id', '_status', 'createdAt', 'updatedAt', 'deletedAt'])

function isLexicalValue(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'root' in value
}

/**
 * Render a stored value as something a manager can compare at a glance.
 * Returns `null` for "no value", so an added field reads as blank → value
 * rather than `"undefined" → value`.
 */
export function formatValue(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  if (Array.isArray(value)) {
    const parts = value.map(formatValue).filter((part): part is string => part != null)
    return parts.length > 0 ? parts.join(', ') : null
  }

  // Rich text — compare what a reader would actually see, not the node tree.
  if (isLexicalValue(value)) return lexicalPlainText(value).trim() || null

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    // A populated relationship: name it rather than printing its row.
    if (typeof record.title === 'string') return record.title
    if (typeof record.name === 'string') return record.name
    if (record.id != null) return `#${String(record.id)}`
    return JSON.stringify(value)
  }

  return String(value)
}

function fieldLabel(field: FlattenedField | undefined, fallback: string): string {
  const label = field && 'label' in field ? field.label : undefined
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') {
    const values = Object.values(label as Record<string, string>)
    if (typeof values[0] === 'string') return values[0]
  }
  return toWords(fallback)
}

/**
 * Label a diff path from the Events config, so the reviewer reads
 * "Online URL" rather than `onlineUrl` — and so the wording can never drift
 * from the collection, because it *is* the collection's.
 */
export function labelForPath(path: (string | number)[], fields?: FlattenedField[]): string {
  const parts: string[] = []
  let current = fields

  for (const segment of path) {
    if (typeof segment === 'number') {
      // An array index — nothing to descend into, just number the row.
      parts.push(`#${segment + 1}`)
      current = undefined
      continue
    }
    const field = current?.find((entry) => 'name' in entry && entry.name === segment)
    parts.push(fieldLabel(field, segment))
    current =
      field && 'flattenedFields' in field ? (field.flattenedFields as FlattenedField[]) : undefined
  }

  return parts.join(' › ')
}

/**
 * Is this a group/json value — something rendered as a block, not a line?
 *
 * Lexical rich text is a plain object too, and emphatically not a block to
 * render: YAML-ing a description turned it into `Root: / Type: root /
 * Children: [{...}]`. `formatValue` already renders it as the words a reader
 * would see, so it stays on the scalar path.
 */
function isBlockValue(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && !isLexicalValue(value)
  )
}

/**
 * Values the system computes or the UI hides — noise inside a rendered group.
 * The schedule alone carries `icalRule`, `upcomingDates` and `lastDate`, all
 * derived from the dates beside them, plus the opaque Mapbox id behind the
 * address search box.
 */
function isNoiseField(field: FlattenedField | undefined, key: string): boolean {
  if (key === 'mapboxId') return true
  if (!field) return false
  if ('virtual' in field && field.virtual) return true
  return Boolean(field.admin?.hidden)
}

/**
 * Render a group as YAML-ish `label: value` lines.
 *
 * Hand-rolled rather than handed to a YAML library, because the point is *not*
 * to serialise the stored object: keys are replaced with the Events field
 * labels a reviewer already reads elsewhere in the diff, and leaves go through
 * `formatValue`, so a lexical description or a populated relationship reads the
 * same here as it does on its own row. A serialiser would print the raw shape.
 *
 * Empty leaves are dropped — a group listing ten `null`s buries the four values
 * that matter.
 */
export function renderGroupYaml(
  value: unknown,
  fields?: FlattenedField[],
  depth = 0,
): string {
  if (!isBlockValue(value)) return formatValue(value) ?? ''
  const pad = '  '.repeat(depth)
  const lines: string[] = []

  for (const [key, child] of Object.entries(value)) {
    const field = fields?.find((entry) => 'name' in entry && entry.name === key)
    if (isNoiseField(field, key)) continue
    const label = fieldLabel(field, key)
    const nested =
      field && 'flattenedFields' in field ? (field.flattenedFields as FlattenedField[]) : undefined

    if (isBlockValue(child)) {
      const block = renderGroupYaml(child, nested, depth + 1)
      if (block.trim()) lines.push(`${pad}${label}:`, block)
      continue
    }
    const rendered = formatValue(child)
    if (rendered !== null) lines.push(`${pad}${label}: ${rendered}`)
  }

  return lines.join('\n')
}

/**
 * Diff the target event against what it would become. `before` is the existing
 * event for an update proposal, or the new-event defaults for a fresh listing —
 * in which case every entry naturally reads as an addition.
 */
export function buildProposedChanges(args: {
  before: Record<string, unknown>
  after: Record<string, unknown>
  fields?: FlattenedField[]
}): ProposedChange[] {
  const entries = diff(args.before, args.after).filter(
    (entry) => !OMITTED_ROOTS.has(String(entry.path[0])),
  )

  // Group/json fields collapse to one entry each. Seven separate
  // "Address › …" rows told a reviewer which keys moved but never what the
  // address now reads as; one YAML block with every subfield, word-diffed,
  // shows the change in the context that makes it judgeable.
  const blockKeys = new Set<string>()
  for (const entry of entries) {
    const key = String(entry.path[0])
    if (isBlockValue(args.before[key]) || isBlockValue(args.after[key])) blockKeys.add(key)
  }

  const changes: ProposedChange[] = []

  for (const key of blockKeys) {
    const field = args.fields?.find((entry) => 'name' in entry && entry.name === key)
    const nested =
      field && 'flattenedFields' in field ? (field.flattenedFields as FlattenedField[]) : undefined
    const before = renderGroupYaml(args.before[key], nested) || null
    const after = renderGroupYaml(args.after[key], nested) || null
    if (before === after) continue
    changes.push({
      path: key,
      label: labelForPath([key], args.fields),
      kind: before === null ? 'added' : after === null ? 'removed' : 'changed',
      before,
      after,
      block: true,
      // Always word-diffed: a block is exactly the case where showing both
      // copies in full defeats the purpose.
      ...(before !== null && after !== null ? { segments: wordSegments(before, after) } : {}),
    })
  }

  const scalars = entries
    .filter((entry) => !blockKeys.has(String(entry.path[0])))
    .map((entry): ProposedChange => {
      const before = 'oldValue' in entry ? formatValue(entry.oldValue) : null
      const after = 'value' in entry ? formatValue(entry.value) : null

      const longEdit =
        before !== null &&
        after !== null &&
        (before.length >= WORD_DIFF_MIN_LENGTH || after.length >= WORD_DIFF_MIN_LENGTH)

      return {
        path: entry.path.join('.'),
        label: labelForPath(entry.path, args.fields),
        ...(longEdit ? { segments: wordSegments(before, after) } : {}),
        // Classify by what the reviewer sees, not by microdiff's key-level
        // verdict: a column that held `null` and now holds a value is a
        // CHANGE to microdiff and plainly an addition to a human.
        kind: before === null ? 'added' : after === null ? 'removed' : 'changed',
        before,
        after,
      }
    })
    // Formatting can collapse a raw difference to no visible difference at all
    // (`null` vs `''`, an unchanged relationship rendered by title). Showing
    // those would tell a reviewer something changed when nothing they can see did.
    .filter((change) => change.before !== change.after)

  return [...changes, ...scalars]
}
