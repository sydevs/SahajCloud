/**
 * The pure half of the import review surface: what each line and each proposed
 * node is called, which of them need a reviewer's attention, and the two files
 * the batch page hands back.
 *
 * ⚠ **Every case here was checked by reintroducing the defect it names.** Three
 * specs written for this feature's earlier phases passed against the very bugs
 * they were for (`tests/AGENTS.md`), so a green new assertion proves nothing on
 * its own.
 */

import { parse } from 'csv-parse/sync'
import { describe, expect, it } from 'vitest'

import {
  duplicateMatchNote,
  skipReasons,
  type CommitRow,
} from '@/collections/EventImports/commit/rows'
import { IMPORT_COLUMNS } from '@/collections/EventImports/csv/columns'
import { parseImportCsv } from '@/collections/EventImports/csv/parse'
import {
  SKIPPED_REASON_COLUMN,
  skippedRowsCsv,
} from '@/collections/EventImports/csv/skippedCsv'
import type { ExistingRegion } from '@/collections/EventImports/propose/match'
import type { ProposedNode } from '@/collections/EventImports/propose/tree'
import {
  isRunningStatus,
  progressUrl,
} from '@/components/admin/EventImport/progressUrl'
import {
  needsAttention,
  rowNotes,
  rowPlace,
  rowStatus,
  rowTitle,
  withDuplicateAction,
} from '@/components/admin/EventImport/rowModel'
import {
  childrenByParent,
  isEditableNode,
  isUnmappableNode,
  mappableByLevel,
  takenSlugsFor,
} from '@/components/admin/EventImport/treeModel'

const row = (overrides: Partial<CommitRow> = {}): CommitRow => ({
  line: 2,
  values: { title: 'Tuesday Meditation', city: 'Berlin' },
  ...overrides,
})

/** The one shape `rowStatus` treats as geocoded. Only its presence is read. */
const RESOLVED = { latitude: 52.5, longitude: 13.4 } as NonNullable<CommitRow['resolved']>

const node = (overrides: Partial<ProposedNode> = {}): ProposedNode =>
  ({
    key: 'city:berlin',
    level: 'city',
    name: 'Berlin',
    parentKey: null,
    match: { kind: 'create' },
    slug: 'berlin',
    location: { kind: 'mapbox', mapboxId: 'place.1' },
    lines: [2],
    ...overrides,
  }) as ProposedNode

const region = (overrides: Partial<ExistingRegion> = {}): ExistingRegion => ({
  id: 7,
  level: 'city',
  name: 'Berlin',
  slug: 'berlin',
  mapboxId: 'place.1',
  parentId: 1,
  inTarget: true,
  ...overrides,
})

describe('what the rows table says about one line', () => {
  /**
   * The order these are read in is the meaning, and getting it wrong claims an
   * answer nobody gave: an unresolved row has no point for a duplicate check to
   * have run against, and a committed row is history whatever else it carries.
   */
  it('reads a row\'s state in precedence order', () => {
    expect(rowStatus(row({ committed: { eventId: 9 }, errors: ['nope'] }))).toBe('committed')
    expect(rowStatus(row({ errors: ['nope'], resolved: RESOLVED }))).toBe('error')
    expect(rowStatus(row({ duplicate: { reason: 'city-and-time' } }))).toBe('pending')
    expect(rowStatus(row({ resolved: RESOLVED, duplicate: { reason: 'city-and-time' } }))).toBe(
      'duplicate',
    )
    expect(rowStatus(row({ resolved: RESOLVED }))).toBe('ready')
  })

  /**
   * A warning does not stop a row, so it is not a status — but it is the other
   * reason a reviewer has to look at one, and folding it into the status set
   * would hide it behind "Ready".
   */
  it('flags a warned row even though it will import', () => {
    const warned = row({ resolved: RESOLVED, warnings: ['the geocode reached only the town'] })
    expect(rowStatus(warned)).toBe('ready')
    expect(needsAttention(warned)).toBe(true)
    expect(needsAttention(row({ resolved: RESOLVED }))).toBe(false)
  })

  it('names the place as specifically as the file does, and an online class as online', () => {
    expect(rowPlace(row({ values: { venueName: 'Community Hall', city: 'Berlin' } }))).toBe(
      'Community Hall, Berlin',
    )
    expect(rowPlace(row({ values: { city: 'Berlin' } }))).toBe('Berlin')
    expect(rowPlace(row({ values: { onlineUrl: 'https://example.org/call' } }))).toBe('Online')
    expect(rowPlace(row({ values: {} }))).toBe('—')
  })

  it('shows errors before warnings, and an em dash for neither', () => {
    expect(rowNotes(row({ errors: ['no date'], warnings: ['only the town'] }))).toBe(
      'no date; only the town',
    )
    expect(rowNotes(row())).toBe('—')
  })

  /**
   * ⚠ **The reason the table prints is the commit's own.** `skipReasons`
   * (`commit/rows.ts`) is what writes the skipped-lines CSV and the summary
   * email, and its own ⚠ says why a second spelling here would read as the
   * commit having found a different fault from the one the reviewer approved
   * skipping. This case is what holds the table to it.
   */
  it('takes a skipped duplicate’s wording from the commit, and drops it once imported', () => {
    const matched = row({
      resolved: RESOLVED,
      duplicate: { reason: 'nearby-address', eventId: 412, strength: 'weak' },
    })

    expect(rowNotes(matched)).toBe(skipReasons(matched).join('; '))
    expect(rowNotes(matched)).toContain('possibly a repeat of class #412')
    // Chosen to import, so the match is no longer a reason the row is skipped —
    // but the Duplicate column still has to say what it matched.
    const imported = { ...matched, duplicate: { ...matched.duplicate!, action: 'import' as const } }
    expect(rowNotes(imported)).toBe('—')
    expect(duplicateMatchNote(imported)).toBe('possibly a repeat of class #412')
  })

  it('falls back to an em dash for a blank title rather than printing nothing', () => {
    expect(rowTitle(row({ values: { title: '   ' } }))).toBe('—')
    expect(rowTitle(row())).toBe('Tuesday Meditation')
  })
})

describe('choosing what to do with a duplicate', () => {
  const rows: CommitRow[] = [
    row({ line: 2, resolved: RESOLVED, duplicate: { reason: 'nearby-address' } }),
    row({ line: 3, resolved: RESOLVED, duplicate: { reason: 'city-and-time' } }),
  ]

  /**
   * ⚠ **The value goes to `refuseRowEdits`, which refuses any delta outside
   * `duplicate.action`.** So a decision that rebuilt a second row — or mutated
   * one in place and left React holding the same reference — would fail the
   * whole save, naming a line the reviewer never touched.
   */
  it('changes the one line named and leaves every other row identical', () => {
    const next = withDuplicateAction(rows, 3, 'import')

    expect(next[1]!.duplicate?.action).toBe('import')
    expect(next[0]).toBe(rows[0])
    expect(next[1]).not.toBe(rows[1])
    expect(next.map((each) => each.line)).toEqual([2, 3])
  })

  /** A row with no match has no decision to carry, and gaining one is a refusal. */
  it('ignores a line that is not a duplicate', () => {
    const plain = [row({ line: 4, resolved: RESOLVED })]
    expect(withDuplicateAction(plain, 4, 'import')[0]).toBe(plain[0])
  })
})

describe('what the region tree offers per node', () => {
  /**
   * ⚠ **A node whose parent was pruned is adopted by the root.** The renderer
   * walks down from the root, so a node keyed on an absent parent would be in
   * the tree and on no screen — and it is exactly the node whose refusal the
   * reviewer needs to see.
   */
  it('adopts an orphan rather than dropping it', () => {
    const byParent = childrenByParent([
      node({ key: 'city:pune', parentKey: 'region:gone' }),
      node({ key: 'city:berlin', parentKey: null }),
    ])

    expect(byParent.get(null)?.map((each) => each.key)).toEqual(['city:pune', 'city:berlin'])
    expect(byParent.get('region:gone')).toBeUndefined()
  })

  it('nests a child under its own parent when that parent is present', () => {
    const byParent = childrenByParent([
      node({ key: 'region:by', level: 'region', parentKey: null }),
      node({ key: 'city:munich', parentKey: 'region:by' }),
    ])

    expect(byParent.get(null)?.map((each) => each.key)).toEqual(['region:by'])
    expect(byParent.get('region:by')?.map((each) => each.key)).toEqual(['city:munich'])
  })

  /**
   * The same tests `applyTreeEdits` makes. Offering a control it refuses reads
   * as the control being broken.
   */
  it('offers an edit only where the write side accepts one', () => {
    expect(isEditableNode(node())).toBe(true)
    expect(
      isEditableNode(node({ match: { kind: 'existing', regionId: 7, name: 'Berlin', slug: 'berlin' } })),
    ).toBe(false)
    expect(isEditableNode(node({ match: { kind: 'elsewhere', regionId: 9, name: 'Berlin' } }))).toBe(
      false,
    )
  })

  /** Only a node the reviewer mapped carries `before`, and only that may be taken back. */
  it('offers "create it instead" for a reviewer\'s own mapping alone', () => {
    const mapped = node({
      match: { kind: 'existing', regionId: 7, name: 'Berlin', slug: 'berlin' },
      before: { name: 'Berlin', parentKey: null, location: null },
    })
    const matchedByTheProposal = node({
      match: { kind: 'existing', regionId: 7, name: 'Berlin', slug: 'berlin' },
    })

    expect(isUnmappableNode(mapped)).toBe(true)
    expect(isUnmappableNode(matchedByTheProposal)).toBe(false)
  })

  /**
   * A city mapped onto a state is a refusal the reviewer was invited to make,
   * so the level is the index — and grouping once is what stops every node
   * re-scanning a country's whole subtree on every render.
   */
  it('indexes the mappable regions by the level a node must match', () => {
    const byLevel = mappableByLevel([
      region({ id: 7 }),
      region({ id: 8, level: 'region', slug: 'bavaria' }),
      region({ id: 9, slug: 'munich' }),
    ])

    expect(byLevel.get('city')?.map((each) => each.id)).toEqual([7, 9])
    expect(byLevel.get('region')?.map((each) => each.id)).toEqual([8])
    expect(byLevel.get('venue')).toBeUndefined()
  })

  /**
   * The namespace is deliberately the subtree plus the proposal, not the whole
   * collection — the commit re-slugs against the live rows. What must not drop
   * out of it is a node's own slug, or a rename could take the slug of the node
   * beside it.
   */
  it('collects the slugs a rename has to miss, dropping the nodes that have none', () => {
    expect(
      takenSlugsFor(
        [region({ slug: 'berlin' })],
        [node({ slug: 'munich' }), node({ key: 'other', slug: null })],
      ),
    ).toEqual(['berlin', 'munich'])
  })
})

describe('the progress poll', () => {
  /**
   * ⚠ **Running is named, not derived as a complement.** A status added to the
   * collection would otherwise read as running and poll a batch nobody is
   * touching, every three seconds, for as long as the page stays open.
   */
  it('counts only the two stages a job owns as running', () => {
    expect(isRunningStatus('resolving')).toBe(true)
    expect(isRunningStatus('committing')).toBe(true)
    for (const settled of ['review', 'finished', 'failed', 'discarded', undefined, null]) {
      expect(isRunningStatus(settled)).toBe(false)
    }
  })

  /**
   * The locale is in the URL because a manager's roles are per-locale, and a
   * read naming none resolves to the default one — denying anyone whose roles
   * live elsewhere (#701).
   */
  it('names the locale and selects only the two columns it renders', () => {
    const url = new URL(progressUrl('/api', 42, 'de'), 'https://cloud.test')

    expect(url.pathname).toBe('/api/event-imports/42')
    expect(url.searchParams.get('locale')).toBe('de')
    expect(url.searchParams.get('select[status]')).toBe('true')
    expect(url.searchParams.get('select[progress]')).toBe('true')
    expect(url.searchParams.get('select[rows]')).toBeNull()
  })
})

describe('the skipped-lines download', () => {
  const skipped = [
    {
      line: 3,
      reasons: ['no date', 'unknown country'],
      values: { title: 'Thursday, 19:00', city: 'Berlin' },
    },
  ]

  /**
   * ⚠ **The file goes back through the same upload.** `checkHeader` refuses an
   * unrecognised column and skips one prefixed `#`, so the reasons column has to
   * carry that prefix or a volunteer must delete it before re-uploading — which
   * is the step they will forget.
   */
  it('round-trips through the parser that produced it', () => {
    const csv = skippedRowsCsv(skipped)
    const [header] = parse(csv.replace(/^\uFEFF/, '')) as string[][]

    expect(header).toEqual([...IMPORT_COLUMNS.map(({ name }) => name), SKIPPED_REASON_COLUMN])
    expect(SKIPPED_REASON_COLUMN.startsWith('#')).toBe(true)

    const reparsed = parseImportCsv(csv)
    expect(reparsed.ok).toBe(true)
    // The row comes back as itself, with the reasons column dropped rather than
    // refused — the fixed file is the one a volunteer uploads next.
    expect(reparsed.ok && reparsed.rows[0]!.values.title).toBe('Thursday, 19:00')
  })

  it('names the line each reason belongs to, and quotes a value holding the delimiter', () => {
    const csv = skippedRowsCsv(skipped)
    expect(csv).toContain('line 3: no date; unknown country')
    expect(csv).toContain('"Thursday, 19:00"')
  })

  /**
   * ⚠ Excel reads a CSV without a byte-order mark in the system's legacy code
   * page, so a volunteer's own accents come back mangled — and are saved that
   * way.
   */
  it('leads with a byte-order mark', () => {
    expect(skippedRowsCsv([])).toMatch(/^\uFEFF/)
  })
})
