'use client'

import React from 'react'

import { StatusIcon } from './StatusIcon'
import { aggregateBodyStyle, aggregateValueStyle } from './styles'

interface AggregateStatusProps {
  actual: number
  threshold: number
  passed: boolean
}

export const AggregateStatus: React.FC<AggregateStatusProps> = ({
  actual,
  threshold,
  passed,
}) => (
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
