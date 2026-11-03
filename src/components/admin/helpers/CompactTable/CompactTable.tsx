'use client'

import type React from 'react'

import { Table } from '@payloadcms/ui'

import { tableColumn } from '../tableColumn'

import './styles.css'

export interface CompactColumn {
  /** Stable key; Payload also uses it for the cell's `cell-<key>` class. */
  key: string
  heading: React.ReactNode
  /** One node per row, in row order. */
  cells: React.ReactNode[]
  /**
   * Size the column to its content rather than sharing the width out. `true`
   * takes the content's full width; a `maxWidth` (any CSS length) caps it, and
   * only content past the cap wraps.
   */
  fit?: boolean | { maxWidth: string }
}

export interface CompactTableProps {
  columns: CompactColumn[]
  /**
   * One id per row, written to the row's `data-id` — what a stylesheet keys a
   * per-row style on. Defaults to the row's index.
   */
  rowIds?: (number | string)[]
  /** Makes every row clickable, and Enter/Space on a focused cell too. */
  onRowClick?: (index: number) => void
  className?: string
}

/**
 * The table a **field** renders: Payload's own `Table`, made dense enough to
 * sit inside a form or a sidebar.
 *
 * Payload ships one dense variant, `appearance="condensed"`, and it gives the
 * header the same `--theme-elevation-50` as the striped rows, so the header and
 * the first row read as one band. This keeps Payload's default appearance —
 * clear header, striped rows — and only tightens it. Full-page tables (the
 * dashboards) use `Table` directly.
 *
 * `Table` exposes nothing per row, so a row click is one delegated listener,
 * resolving the row by its position in `<tbody>` rather than by Payload's
 * markup attributes, which are Payload's to rename.
 */
export const CompactTable: React.FC<CompactTableProps> = ({
  columns,
  rowIds,
  onRowClick,
  className,
}) => {
  const rowCount = columns[0]?.cells.length ?? 0

  const openRow = (target: EventTarget | null) => {
    if (!onRowClick) return
    const row = (target as HTMLElement | null)?.closest?.('tr')
    const body = row?.parentElement
    if (!row || body?.tagName !== 'TBODY') return
    const index = Array.prototype.indexOf.call(body.children, row)
    if (index >= 0 && index < rowCount) onRowClick(index)
  }

  const classes = ['compact-table', onRowClick && 'compact-table--clickable', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      onClick={onRowClick ? (event) => openRow(event.target) : undefined}
      onKeyDown={
        onRowClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') openRow(event.target)
            }
          : undefined
      }
    >
      <Table
        data={Array.from({ length: rowCount }, (_, index) => ({ id: rowIds?.[index] ?? index }))}
        columns={columns.map(({ key, heading, cells, fit }) => {
          if (!fit) return tableColumn(key, heading, cells)
          const style = typeof fit === 'object' ? { maxWidth: fit.maxWidth } : undefined
          const fitted = (node: React.ReactNode, index?: number) => (
            <span key={index} className="compact-table__fit" style={style}>
              {node}
            </span>
          )
          return tableColumn(key, fitted(heading), cells.map(fitted))
        })}
      />
    </div>
  )
}
