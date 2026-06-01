'use client'

import React from 'react'

import { ReadinessTable } from './ReadinessTable'
import { StatusIcon } from './StatusIcon'
import { aggregateBodyStyle, aggregateValueStyle } from './styles'

const STATUS_COLUMNS = [{ key: 'status', label: 'Status' }]

interface AggregateStatusProps {
  actual: number
  threshold: number
  passed: boolean
  items?: Array<{ key: string; label: string; passed: boolean }>
}

export const AggregateStatus: React.FC<AggregateStatusProps> = ({
  actual,
  threshold,
  passed,
  items,
}) => {
  if (items !== undefined) {
    const passingCount = items.filter((i) => i.passed).length
    const failingItems = items.filter((i) => !i.passed)
    const rows = [
      {
        id: '__summary',
        label: `${passingCount} keys passing`,
        checks: [{ key: 'status', passed: true }],
        isSummary: true as const,
      },
      ...failingItems.map((item) => ({
        id: item.key,
        label: item.label,
        checks: [{ key: 'status', passed: false }],
      })),
    ]
    return <ReadinessTable checkColumns={STATUS_COLUMNS} rows={rows} />
  }

  return (
    <div style={aggregateBodyStyle}>
      <StatusIcon passed={passed} />
      <span style={aggregateValueStyle}>
        {actual} <span style={{ color: 'var(--theme-elevation-500)', fontWeight: 400 }}>/</span>{' '}
        {threshold}
      </span>
      <span style={{ color: 'var(--theme-elevation-500)' }}>
        {passed ? 'threshold met' : `${threshold - actual} more needed`}
      </span>
    </div>
  )
}
