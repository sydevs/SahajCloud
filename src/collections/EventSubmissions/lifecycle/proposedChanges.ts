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
export function formatValue(value: unknown, field?: FlattenedField): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  const option = optionLabel(field, value)
  if (option !== null) return option

  // A stored instant is unreadable as `2026-09-03T16:30:00.000Z`, and diffing
  // it word by word produces nonsense like `2026-«-07»«+09»-«-18T16»«+03T16»`.
  // Formatted first, the diff lands on whole date parts a human can compare.
  if (field?.type === 'date' && typeof value === 'string') {
    const formatted = formatInstant(value)
    if (formatted) return formatted
  }

  if (Array.isArray(value)) {
    const parts = value.map((entry) => formatValue(entry, field))
      .filter((part): part is string => part != null)
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

/**
 * `3 Sep 2026, 16:30 UTC` — fixed locale and zone on purpose. This runs
 * server-side, so anything locale- or machine-timezone-dependent would render
 * differently per deploy; and the stored value *is* a UTC instant (the event's
 * own zone lives beside it in `firstDate_tz`), so saying so is honest rather
 * than silently reinterpreting it.
 */
function formatInstant(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)} UTC`
}

/** A Payload `StaticLabel` is a string or a per-locale record; take either. */
function labelText(label: unknown): string | null {
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') {
    const values = Object.values(label as Record<string, unknown>)
    if (typeof values[0] === 'string') return values[0]
  }
  return null
}

function fieldLabel(field: FlattenedField | undefined, fallback: string): string {
  const label = field && 'label' in field ? field.label : undefined
  return labelText(label) ?? toWords(fallback)
}

/**
 * A select stores its option's *value*, which is rarely what the option is
 * called: a schedule read `Repeats: WEEKLY / On Days: TH / Day: MO`, three
 * different vocabularies for a reviewer to decode. The field already carries
 * the wording the admin form shows — use it.
 */
function optionLabel(field: FlattenedField | undefined, value: unknown): string | null {
  // `options` is guaranteed by Payload's own types but not by the shape of a
  // hand-built field list, and a select with none simply has no label to give.
  if (!field || field.type !== 'select' || !Array.isArray(field.options)) return null
  const match = field.options.find((option) =>
    typeof option === 'string' ? option === value : option.value === value,
  )
  if (match == null) return null
  return typeof match === 'string' ? match : (labelText(match.label) ?? match.value)
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
 * A relationship or upload value is a **reference to name**, never a group to
 * expand. A populated one is a plain object like any group, so without this a
 * proposed manager rendered as their entire row — id, roles, email, every
 * notification preference — instead of `Manager: Jane Doe`. `formatValue`
 * already knows how to name one.
 */
function isReference(field: FlattenedField | undefined): boolean {
  return field?.type === 'relationship' || field?.type === 'upload'
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
 * Does this field apply, given the values beside it?
 *
 * A schedule keeps every recurrence sub-field in one row of columns, so a
 * weekly event still carries whatever was last typed into the monthly ones.
 * Rendering all of them read as nine unrelated keys — `Repeats: Weekly` beside
 * `Monthly Mode: By date`, `Week: 1st`, `Day: Monday` — describing state that
 * has no effect on the event. The admin form already hides them; `admin.condition`
 * is that rule, and it lives on the field, so the diff can ask the same question
 * rather than hard-coding which keys pair with which.
 *
 * Only applied *inside* a rendered group, where an inapplicable key is noise
 * within a block the reviewer can still see. A top-level field is never hidden
 * this way — that would drop a proposed change from the diff entirely.
 */
function isInapplicable(
  field: FlattenedField | undefined,
  data: Record<string, unknown>,
  siblingData: Record<string, unknown>,
): boolean {
  const condition = field?.admin?.condition
  if (typeof condition !== 'function') return false
  try {
    return !condition(data, siblingData, {
      blockData: {},
      operation: 'update',
      path: [],
      user: null,
    })
  } catch {
    // A condition wanting more context than a diff has (a signed-in user, a
    // block's own data) is no reason to hide a value the reviewer may need.
    return false
  }
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
/** Rank of a name the field list doesn't declare — sorted last, order kept. */
const UNRANKED = Number.MAX_SAFE_INTEGER

/**
 * Where the collection declares each field, by name.
 *
 * `flattenedFields` is depth-first in declaration order, so this is the order a
 * manager reads down the Events form — tabs, rows and collapsibles flattened
 * away. Re-derived from the live config on every call, which is the whole
 * point: moving a field in `Events.ts` moves it in the diff, with nothing here
 * to keep in step.
 */
function declarationRank(fields?: FlattenedField[]): Map<string, number> {
  const rank = new Map<string, number>()
  fields?.forEach((field, index) => {
    if ('name' in field && !rank.has(field.name)) rank.set(field.name, index)
  })
  return rank
}

/**
 * Sort by where the collection declares each name. A name the config doesn't
 * know about sorts last in its own order rather than being dropped — an
 * unrecognised key is exactly the kind of thing a reviewer should see.
 */
function byDeclaration<T>(items: T[], nameOf: (item: T) => string, rank: Map<string, number>): T[] {
  // `sort` is stable, so equal ranks (two unknown names) keep their order.
  return [...items].sort(
    (a, b) => (rank.get(nameOf(a)) ?? UNRANKED) - (rank.get(nameOf(b)) ?? UNRANKED),
  )
}

/** The group's keys in the order the collection declares them. */
function orderedKeys(value: Record<string, unknown>, fields?: FlattenedField[]): string[] {
  if (!fields) return Object.keys(value)
  return byDeclaration(Object.keys(value), (key) => key, declarationRank(fields))
}

export function renderGroupYaml(
  value: unknown,
  fields?: FlattenedField[],
  /** The whole document, for `admin.condition` — which reads both. */
  data: Record<string, unknown> = {},
  depth = 0,
): string {
  const filtered = renderLines(value, fields, data, depth, true)
  if (filtered) return filtered
  // Every sub-field ruled out. Not every condition means "does not apply" —
  // the address group's mean "don't reveal these until a place is picked", so
  // a submission typed in by hand (no `mapboxId`) had its entire address
  // filtered away and the reviewer saw no address at all. A condition is a
  // hint for trimming noise; it is never a reason to show the reviewer
  // nothing, so an emptied block falls back to the unfiltered one.
  return renderLines(value, fields, data, depth, false)
}

function renderLines(
  value: unknown,
  fields: FlattenedField[] | undefined,
  data: Record<string, unknown>,
  depth: number,
  respectConditions: boolean,
): string {
  if (!isBlockValue(value)) return formatValue(value) ?? ''
  const pad = '  '.repeat(depth)
  const lines: string[] = []

  // Ordered by the collection, not by the object's own keys. A proposal's
  // patch and a stored event enumerate their keys in different orders, so
  // rendering insertion order put the same group's lines in one order on a new
  // submission and another on an update — and the word diff then reported the
  // reshuffle as a change.
  for (const key of orderedKeys(value, fields)) {
    const child = value[key]
    const field = fields?.find((entry) => 'name' in entry && entry.name === key)
    if (isNoiseField(field, key)) continue
    if (respectConditions && isInapplicable(field, data, value)) continue
    const label = fieldLabel(field, key)
    const nested =
      field && 'flattenedFields' in field ? (field.flattenedFields as FlattenedField[]) : undefined

    if (isBlockValue(child)) {
      const block = renderLines(child, nested, data, depth + 1, respectConditions)
      if (block.trim()) lines.push(`${pad}${label}:`, block)
      continue
    }
    const rendered = formatValue(child, field)
    if (rendered !== null) lines.push(`${pad}${label}: ${rendered}`)
  }

  return lines.join('\n')
}

/**
 * Diff the target event against what it would become. `before` is the existing
 * event for an update proposal, or the new-event defaults for a fresh listing —
 * in which case every entry naturally reads as an addition.
 */
/** The field a diff path lands on, for type-aware formatting. */
function fieldAtPath(
  path: (string | number)[],
  fields?: FlattenedField[],
): FlattenedField | undefined {
  let current = fields
  let found: FlattenedField | undefined
  for (const segment of path) {
    if (typeof segment === 'number') continue
    found = current?.find((entry) => 'name' in entry && entry.name === segment)
    if (!found) return undefined
    current =
      'flattenedFields' in found ? (found.flattenedFields as FlattenedField[]) : undefined
  }
  return found
}

export function buildProposedChanges(args: {
  before: Record<string, unknown>
  after: Record<string, unknown>
  fields?: FlattenedField[]
}): ProposedChange[] {
  const entries = diff(args.before, args.after).filter(
    (entry) => !OMITTED_ROOTS.has(String(entry.path[0])),
  )

  // Two kinds of root are judged whole rather than key by key.
  //
  // **Groups**: seven separate "Address › …" rows told a reviewer which keys
  // moved but never what the address now reads as; one block with every
  // subfield shows the change in the context that makes it judgeable.
  //
  // **Arrays**: microdiff reports a hasMany list per index, so adding one
  // language surfaced as `Languages › #2` — a row number the reviewer has no
  // way to relate to anything. The list is one value; diff it as one.
  const wholeKeys = new Set<string>()
  const isWhole = (value: unknown) => isBlockValue(value) || Array.isArray(value)
  for (const entry of entries) {
    const key = String(entry.path[0])
    if (isWhole(args.before[key]) || isWhole(args.after[key])) wholeKeys.add(key)
  }

  const changes: ProposedChange[] = []

  for (const key of wholeKeys) {
    const field = args.fields?.find((entry) => 'name' in entry && entry.name === key)
    const nested =
      field && 'flattenedFields' in field ? (field.flattenedFields as FlattenedField[]) : undefined
    // A group renders as labelled lines; a list or a reference renders as one
    // value, which is already the shortest honest way to show it.
    const expandable = !isReference(field)
    const render = (side: Record<string, unknown>) =>
      expandable && isBlockValue(side[key])
        ? renderGroupYaml(side[key], nested, side) || null
        : formatValue(side[key], field)
    const before = render(args.before)
    const after = render(args.after)
    if (before === after) continue

    const block = expandable && (isBlockValue(args.before[key]) || isBlockValue(args.after[key]))
    changes.push({
      path: key,
      label: labelForPath([key], args.fields),
      kind: before === null ? 'added' : after === null ? 'removed' : 'changed',
      before,
      after,
      ...(block ? { block: true as const } : {}),
      // Only a two-sided edit is word-diffed. An addition or a removal is one
      // whole `+`/`−` side with nothing to compare it against, and segmenting
      // it just to carry the renderer's key emphasis made it look like a
      // partial edit — the renderer bolds keys off `block` instead.
      ...(before !== null && after !== null ? { segments: wordSegments(before, after) } : {}),
    })
  }

  const scalars = entries
    .filter((entry) => !wholeKeys.has(String(entry.path[0])))
    .map((entry): ProposedChange => {
      const field = fieldAtPath(entry.path, args.fields)
      const before = 'oldValue' in entry ? formatValue(entry.oldValue, field) : null
      const after = 'value' in entry ? formatValue(entry.value, field) : null

      const longEdit =
        before !== null &&
        after !== null &&
        (before.length >= WORD_DIFF_MIN_LENGTH || after.length >= WORD_DIFF_MIN_LENGTH)

      return {
        path: entry.path.join('.'),
        label: labelForPath(entry.path, args.fields),
        ...(longEdit ? { segments: wordSegments(before, after) } : {}),
        // Classify by what the reviewer sees, not by microdiff's key-level
        // verdict. A column that held `null` and now holds a value is a
        // CHANGE to microdiff, but plainly an addition to a human.
        kind: before === null ? 'added' : after === null ? 'removed' : 'changed',
        before,
        after,
      }
    })
    // Formatting can collapse a raw difference to no visible difference at all
    // (`null` vs `''`, an unchanged relationship rendered by title). Showing
    // those would tell a reviewer something changed when nothing they can see did.
    .filter((change) => change.before !== change.after)

  // Read in the order the Events form reads. Blocks were emitted before
  // scalars and each set in whatever order microdiff walked them, so the same
  // event's diff listed Languages, Address, Schedule, then the contact row —
  // an order matching neither the form nor anything else the reviewer knows.
  return byDeclaration(
    [...changes, ...scalars],
    (change) => change.path.split('.')[0]!,
    declarationRank(args.fields),
  )
}
