'use client'

import React, { useState } from 'react'

import { StatusIcon } from './StatusIcon'
import {
  emptyGroupStyle,
  linkRowStyle,
  tableCheckCellStyle,
  tableCheckHeaderCellStyle,
  tableHeaderCellStyle,
  tableRowCellStyle,
  tableStyle,
  tooltipStyle,
} from './styles'

export interface ReadinessTableRow {
  id: string | number
  label: string
  /** Admin deep-link; absent renders the label as plain text. */
  link?: string
  checks: Array<{ key: string; passed: boolean }>
  /** Marks the "X items passing" summary row — gets a neutral background. */
  isSummary?: boolean
}

export interface CheckColumn {
  key: string
  label: string
  description?: string
}

interface ReadinessTableProps {
  rows: ReadinessTableRow[]
  checkColumns: CheckColumn[]
  emptyMessage?: string
}

function rowBackground(row: ReadinessTableRow, index: number): string {
  if (row.isSummary) return 'var(--theme-elevation-50)'
  if (row.checks.some((c) => !c.passed)) return 'var(--theme-error-50, rgba(220,38,38,0.04))'
  return index % 2 === 0 ? 'var(--theme-elevation-0)' : 'var(--theme-elevation-50)'
}

export const ReadinessTable: React.FC<ReadinessTableProps> = ({
  rows,
  checkColumns,
  emptyMessage = 'No documents in scope for this locale.',
}) => {
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null)

  if (rows.length === 0) {
    return <div style={emptyGroupStyle}>{emptyMessage}</div>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={tableHeaderCellStyle}>Item</th>
            {checkColumns.map((col) => (
              <th
                key={col.key}
                aria-label={col.description ? `${col.label}: ${col.description}` : col.label}
                style={tableCheckHeaderCellStyle}
                tabIndex={0}
                onBlur={() => setHoveredColumn(null)}
                onFocus={() => setHoveredColumn(col.key)}
                onMouseEnter={() => setHoveredColumn(col.key)}
                onMouseLeave={() => setHoveredColumn(null)}
              >
                <span>{col.label}</span>
                {hoveredColumn === col.key && col.description ? (
                  <span style={tooltipStyle}>{col.description}</span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const bg = rowBackground(row, index)
            const checkByKey = new Map(row.checks.map((c) => [c.key, c]))
            return (
              <tr key={String(row.id)} style={{ background: bg }}>
                <td style={tableRowCellStyle}>
                  {row.link ? (
                    <a href={row.link} style={linkRowStyle}>
                      {row.label}
                    </a>
                  ) : (
                    <span>{row.label}</span>
                  )}
                </td>
                {checkColumns.map((col) => {
                  const check = checkByKey.get(col.key)
                  if (!check) {
                    return (
                      <td key={col.key} style={tableCheckCellStyle}>
                        <span style={{ color: 'var(--theme-elevation-400)' }}>—</span>
                      </td>
                    )
                  }
                  return (
                    <td key={col.key} style={tableCheckCellStyle}>
                      <StatusIcon passed={check.passed} title={col.description ?? col.label} />
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
