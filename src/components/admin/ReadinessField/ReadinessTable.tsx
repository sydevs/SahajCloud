'use client'

import React, { useState } from 'react'

import { ExternalLinkIcon } from '../ExternalLinkIcon'
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
  /** Forces failing-row background even when checks is empty (placeholder Missing row). */
  isMissing?: boolean
}

export interface CheckColumn {
  key: string
  label: string
  description?: string
}

interface ReadinessTableProps {
  rows: ReadinessTableRow[]
  checkColumns: CheckColumn[]
}

function rowBackground(row: ReadinessTableRow, index: number): string {
  if (row.isSummary) return 'var(--theme-elevation-50)'
  if (row.isMissing || row.checks.some((c) => !c.passed)) {
    return index % 2 === 0 ? 'rgba(220, 38, 38, 0.16)' : 'rgba(220, 38, 38, 0.09)'
  }
  return index % 2 === 0 ? 'var(--theme-elevation-0)' : 'var(--theme-elevation-50)'
}

export const ReadinessTable: React.FC<ReadinessTableProps> = ({ rows, checkColumns }) => {
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null)

  if (rows.length === 0) {
    return <div style={emptyGroupStyle}>No documents in scope for this locale.</div>
  }

  return (
    <div
      style={{
        border: '1px solid var(--theme-elevation-100)',
        borderRadius: 'var(--style-radius-s)',
      }}
    >
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={tableHeaderCellStyle}>Title</th>
            {checkColumns.map((col) => (
              <th
                key={col.key}
                aria-label={col.description ? `${col.label}: ${col.description}` : col.label}
                style={tableCheckHeaderCellStyle}
                tabIndex={col.description ? 0 : undefined}
                onBlur={col.description ? () => setHoveredColumn(null) : undefined}
                onFocus={col.description ? () => setHoveredColumn(col.key) : undefined}
                onMouseEnter={col.description ? () => setHoveredColumn(col.key) : undefined}
                onMouseLeave={col.description ? () => setHoveredColumn(null) : undefined}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '3px',
                  }}
                >
                  <span>{col.label}</span>
                  {col.description ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '14px',
                        height: '14px',
                        borderRadius: '50%',
                        border: '1px solid var(--theme-elevation-300)',
                        color: 'var(--theme-elevation-500)',
                        fontSize: '10px',
                        lineHeight: 1,
                      }}
                    >
                      ?
                    </span>
                  ) : null}
                </div>
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
            // Summary rows use a muted italic label; check cells render normally (all ✓).
            const labelCellStyle = row.isSummary
              ? { ...tableRowCellStyle, color: 'var(--theme-elevation-500)', fontStyle: 'italic' }
              : tableRowCellStyle
            return (
              <tr key={String(row.id)} style={{ background: bg }}>
                <td style={labelCellStyle}>
                  {row.link ? (
                    <a
                      href={row.link}
                      rel="noopener noreferrer"
                      style={{
                        ...linkRowStyle,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        ...(row.isSummary ? { color: 'var(--theme-elevation-500)' } : {}),
                      }}
                      target="_blank"
                    >
                      {row.label}
                      <ExternalLinkIcon size={11} style={{ opacity: 0.5, flexShrink: 0 }} />
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
