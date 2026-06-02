import type { GroupRow, GroupView, ReadinessGroup, RowDisplay } from './types'

/**
 * Pure view-model builder for a group's table — the single source of the
 * "which rows show, in what order, with what summary/missing placeholders"
 * decisions. Returns ordered check-key columns and link-less row descriptors;
 * the view layer resolves `linkTarget` → admin URL and maps `kind` → styling.
 *
 * `errored` groups are handled separately by the view (they have no table),
 * so this returns an empty view for them.
 */
export function buildGroupView(
  group: ReadinessGroup,
  opts: { rowDisplay?: RowDisplay; groupLabel: string },
): GroupView {
  const columns = deriveColumns(group)
  const groupLabel = opts.groupLabel.toLowerCase()

  if (group.type === 'documents') {
    if (group.documents.length === 0) {
      return { columns, rows: [missingRow(0, columns)] }
    }
    const rows: GroupRow[] = group.documents.map((doc) => ({
      id: doc.id,
      label: doc.label,
      checks: doc.checks,
      kind: 'item',
      // String IDs are sentinels (globals, config slots) — link to the global.
      linkTarget: typeof doc.id === 'number' ? 'document' : 'global',
    }))
    return { columns, rows }
  }

  if (group.type === 'aggregate' && group.items) {
    const items = group.items
    const buildItemRow = (item: (typeof items)[number]): GroupRow => ({
      id: item.id,
      label: item.label,
      checks: item.checks,
      kind: 'item',
      linkTarget: typeof item.id === 'number' ? 'document' : 'global',
    })

    const failingItems = items.filter((item) => !item.checks.every((c) => c.passed))
    const passingItems = items.filter((item) => item.checks.every((c) => c.passed))

    // Missing rows represent uncreated items needed to reach the threshold.
    const missingCount = Math.max(0, group.threshold - items.length)
    const missingRows = Array.from({ length: missingCount }, (_, i) => missingRow(i, columns))

    const rowDisplay: RowDisplay = opts.rowDisplay ?? 'all'

    if (rowDisplay === 'summarize-excess') {
      // Show all failing rows + up to `threshold` passing rows. Summarize excess.
      const excessPassingCount = Math.max(0, passingItems.length - group.threshold)
      const shownPassingItems = passingItems.slice(0, group.threshold)
      const rows: GroupRow[] = [
        ...failingItems.map(buildItemRow),
        ...shownPassingItems.map(buildItemRow),
      ]
      if (excessPassingCount > 0) {
        rows.push(
          summaryRow(
            '__excess_summary',
            `${excessPassingCount} additional ${groupLabel} satisfy this requirement`,
            'list',
            columns,
          ),
        )
      }
      return { columns, rows: [...rows, ...missingRows] }
    }

    if (rowDisplay === 'collapse-passing') {
      // Show only failing rows; collapse all passing rows into one summary row.
      const rows: GroupRow[] = failingItems.map(buildItemRow)
      if (passingItems.length > 0) {
        rows.push(
          summaryRow(
            '__passing_summary',
            `${passingItems.length} of ${items.length} ${groupLabel} passing`,
            'global',
            columns,
          ),
        )
      }
      return { columns, rows: [...rows, ...missingRows] }
    }

    // 'all': show every item row followed by missing placeholder rows.
    return { columns, rows: [...items.map(buildItemRow), ...missingRows] }
  }

  // aggregate without items, or errored — no table.
  return { columns: [], rows: [] }
}

/** Dedupe check keys in encounter order across the group's documents/items. */
function deriveColumns(group: ReadinessGroup): string[] {
  let sources: Array<{ key: string }[]> = []
  if (group.type === 'documents') {
    sources = group.documents.map((d) => d.checks)
  } else if (group.type === 'aggregate' && group.items) {
    sources = group.items.map((i) => i.checks)
  }
  const seen = new Set<string>()
  const cols: string[] = []
  for (const checks of sources) {
    for (const check of checks) {
      if (seen.has(check.key)) continue
      seen.add(check.key)
      cols.push(check.key)
    }
  }
  return cols
}

function missingRow(index: number, columns: string[]): GroupRow {
  return {
    id: `__missing_${index}`,
    label: 'Missing',
    checks: columns.map((key) => ({ key, passed: false })),
    kind: 'missing',
    linkTarget: 'list',
  }
}

function summaryRow(
  id: string,
  label: string,
  linkTarget: GroupRow['linkTarget'],
  columns: string[],
): GroupRow {
  return {
    id,
    label,
    checks: columns.map((key) => ({ key, passed: true })),
    kind: 'summary',
    linkTarget,
  }
}
