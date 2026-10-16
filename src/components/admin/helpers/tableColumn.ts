import type { Table } from '@payloadcms/ui'
import type React from 'react'

/** The exact element type Payload's `Table` expects in `columns`. */
export type PayloadTableColumn = NonNullable<React.ComponentProps<typeof Table>['columns']>[number]

/**
 * Build a column for Payload's `Table`.
 *
 * The Table is list-view-shaped: it reads `accessor` / `active` / `Heading` /
 * `renderedCells` (one pre-rendered node per row) and nothing else. `field` is
 * required by the `Column` type but never touched at runtime, so a stub
 * satisfies it — which is the whole reason this needs a helper rather than an
 * object literal at each call site.
 */
export function tableColumn(
  accessor: string,
  heading: string,
  cells: React.ReactNode[],
): PayloadTableColumn {
  return { accessor, active: true, Heading: heading, renderedCells: cells, field: {} as never }
}
