'use client'

import type { ComponentProps, ReactNode } from 'react'

import { Table } from '@payloadcms/ui'
import { Fragment } from 'react'

import styles from './stackedTable.module.css'

/** The exact element type Payload's `Table` expects in `columns`. */
type PayloadColumn = NonNullable<ComponentProps<typeof Table>['columns']>[number]

/**
 * Build a column for Payload's `Table`.
 *
 * The Table is list-view-shaped: it reads `accessor` / `active` / `Heading` /
 * `renderedCells` (one pre-rendered node per row) and nothing else. `field` is
 * required by the `Column` type but never touched at runtime, so a stub
 * satisfies it — which is the whole reason this is a helper rather than an
 * object literal at each of the two call sites below.
 */
function tableColumn(accessor: string, heading: ReactNode, cells: ReactNode[]): PayloadColumn {
  return { accessor, active: true, Heading: heading, renderedCells: cells, field: {} as never }
}

export type StackedColumn = {
  accessor: string
  /** One node per row, in the order `rows` gives them. */
  cells: ReactNode[]
  heading: ReactNode
  /**
   * What these cells are called once stacked, where `heading` is not the plain
   * text to use — a heading that is a node names nothing on its own.
   */
  label?: string
}

/**
 * Payload's `Table`, plus a phone layout: under 700px each row becomes one
 * block of named lines.
 *
 * `Table` only scrolls sideways, so a column past the edge is a column nobody
 * finds — and stacking the rows alone leaves every value unnamed, because the
 * header row then sits above the first row only. So each cell carries its own
 * label, which the stylesheet hides while the table is a table.
 *
 * ⚠ **The first column takes no label.** It is the row's own title, and
 * "Region: Pune" above the rest reads as one field among them.
 */
export function StackedTable({
  appearance,
  columns,
  rows,
}: {
  appearance?: 'condensed' | 'default'
  columns: StackedColumn[]
  /** `Table` reads nothing off a row but `id`. */
  rows: { id: number | string }[]
}) {
  return (
    <div className={styles.stacked}>
      <Table
        appearance={appearance}
        columns={columns.map(({ accessor, cells, heading, label }, index) => {
          const name =
            index === 0 ? undefined : (label ?? (typeof heading === 'string' ? heading : undefined))
          if (name === undefined) return tableColumn(accessor, heading, cells)
          return tableColumn(
            accessor,
            heading,
            // A cell with nothing in it keeps its empty cell, which the stacked
            // layout leaves out rather than naming a blank line.
            cells.map((cell, row) =>
              cell == null ? (
                cell
              ) : (
                <Fragment key={row}>
                  <span className={styles.label}>{name}</span>
                  {cell}
                </Fragment>
              ),
            ),
          )
        })}
        data={rows.map(({ id }) => ({ id }))}
      />
    </div>
  )
}
