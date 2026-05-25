'use client'

import React, { useMemo, useState } from 'react'

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

interface DocCheck {
  key: string
  passed: boolean
}

interface DocRow {
  id: number | string
  label: string
  checks: DocCheck[]
}

interface ChecksMetadata {
  [key: string]: { label: string; description: string }
}

interface DocumentsTableProps {
  documents: DocRow[]
  /** Slice of statusConfig.checks for this section — drives the column headers. */
  checksMetadata: ChecksMetadata
  /**
   * Collection slug to deep-link rows to (e.g. "lessons"). When null, rows
   * render as plain text instead of links.
   */
  collectionSlug: string | null
  /** Current admin locale code; appended as `?locale=<code>` to row links. */
  localeCode: string
}

/**
 * Derive the set of check column keys from the actual document rows so an
 * unused declared check doesn't render an always-empty column. Order follows
 * first-appearance across the rows.
 */
function deriveColumns(documents: DocRow[]): string[] {
  const seen = new Set<string>()
  const cols: string[] = []
  for (const doc of documents) {
    for (const check of doc.checks) {
      if (seen.has(check.key)) continue
      seen.add(check.key)
      cols.push(check.key)
    }
  }
  return cols
}

export const DocumentsTable: React.FC<DocumentsTableProps> = ({
  documents,
  checksMetadata,
  collectionSlug,
  localeCode,
}) => {
  const columns = useMemo(() => deriveColumns(documents), [documents])
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null)

  if (documents.length === 0) {
    return <div style={emptyGroupStyle}>No documents in scope for this locale.</div>
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={tableHeaderCellStyle}>Document</th>
            {columns.map((key) => {
              const meta = checksMetadata[key]
              const label = meta?.label ?? key
              const description = meta?.description
              return (
                <th
                  key={key}
                  style={tableCheckHeaderCellStyle}
                  onMouseEnter={() => setHoveredColumn(key)}
                  onMouseLeave={() => setHoveredColumn(null)}
                  onFocus={() => setHoveredColumn(key)}
                  onBlur={() => setHoveredColumn(null)}
                  tabIndex={0}
                  aria-label={description ? `${label}: ${description}` : label}
                >
                  <span>{label}</span>
                  {hoveredColumn === key && description ? (
                    <span style={tooltipStyle}>{description}</span>
                  ) : null}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => {
            const checkByKey = new Map(doc.checks.map((c) => [c.key, c]))
            const idIsSentinel = typeof doc.id === 'string'
            const canLink = collectionSlug !== null && !idIsSentinel
            const href = canLink
              ? `/admin/collections/${collectionSlug}/${doc.id}?locale=${encodeURIComponent(localeCode)}`
              : null
            return (
              <tr key={String(doc.id)}>
                <td style={tableRowCellStyle}>
                  {href ? (
                    <a href={href} style={linkRowStyle}>
                      {doc.label}
                    </a>
                  ) : (
                    <span>{doc.label}</span>
                  )}
                </td>
                {columns.map((key) => {
                  const check = checkByKey.get(key)
                  if (!check) {
                    return (
                      <td key={key} style={tableCheckCellStyle}>
                        <span style={{ color: 'var(--theme-elevation-400)' }}>—</span>
                      </td>
                    )
                  }
                  const meta = checksMetadata[key]
                  return (
                    <td key={key} style={tableCheckCellStyle}>
                      <StatusIcon
                        passed={check.passed}
                        title={meta?.description ?? meta?.label ?? key}
                      />
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
