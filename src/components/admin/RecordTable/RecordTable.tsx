import React from 'react'

import { formatCellValue, inferColumns, type RecordColumn, type RecordRow } from './format'

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  border: '1px solid var(--theme-elevation-150)',
  fontSize: '13px',
}

const headCellStyle: React.CSSProperties = {
  padding: 'calc(var(--base) * 0.35) calc(var(--base) * 0.5)',
  color: 'var(--theme-elevation-800)',
  fontWeight: 600,
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

const cellStyle: React.CSSProperties = {
  padding: 'calc(var(--base) * 0.35) calc(var(--base) * 0.5)',
  color: 'var(--theme-elevation-800)',
  verticalAlign: 'top',
}

const emptyStyle: React.CSSProperties = {
  padding: 'calc(var(--base) * 0.5)',
  color: 'var(--theme-elevation-500)',
  fontSize: '13px',
  fontStyle: 'italic',
}

export interface RecordTableProps {
  /** Array of json records to render, one row each. */
  records: RecordRow[]
  /** Explicit columns; inferred from record keys when omitted. */
  columns?: RecordColumn[]
  /** Shown when `records` is empty. */
  emptyMessage?: string
}

/**
 * Generic read-only table for a json array of records. Columns are taken from
 * `columns` when supplied, otherwise inferred from the records' keys. Cells
 * render via {@link formatCellValue} so dates and actor references display
 * cleanly. Purely presentational — no PayloadCMS dependency — so it can be
 * reused and unit-tested outside the admin panel.
 */
export const RecordTable: React.FC<RecordTableProps> = ({
  records,
  columns,
  emptyMessage = 'No records yet.',
}) => {
  if (!records.length) {
    return <div style={emptyStyle}>{emptyMessage}</div>
  }

  const resolvedColumns = columns && columns.length > 0 ? columns : inferColumns(records)

  return (
    <table style={tableStyle}>
      <thead>
        <tr style={{ backgroundColor: 'var(--theme-elevation-50)' }}>
          {resolvedColumns.map((column) => (
            <th key={column.key} style={headCellStyle}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {records.map((record, rowIndex) => (
          <tr key={rowIndex} style={{ borderTop: '1px solid var(--theme-elevation-150)' }}>
            {resolvedColumns.map((column) => (
              <td key={column.key} style={cellStyle}>
                {formatCellValue(record[column.key], column.format)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
