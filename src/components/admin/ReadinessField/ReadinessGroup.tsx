'use client'

import { Collapsible } from '@payloadcms/ui'
import React, { useMemo } from 'react'

import type { ReadinessGroup as Group } from '@/lib/status'

import { AggregateStatus } from './AggregateStatus'
import { ErroredStatus } from './ErroredStatus'
import { ProgressBar } from './ProgressBar'
import { ReadinessPill } from './ReadinessPill'
import { ReadinessTable } from './ReadinessTable'
import { groupBodyStyle, groupDescriptionStyle, headerRowStyle, headerTitleStyle } from './styles'
import { summaryTone, type SummaryTone } from './summary'

interface ReadinessGroupProps {
  group: Group
  groupMetadata: { label: string; description: string } | undefined
  checksMetadata: Record<string, { label: string; description: string }>
  collectionSlug: string | null
  localeCode: string
}

function groupTone(group: Group): SummaryTone {
  if (group.optional) return 'neutral'
  if (group.type === 'documents') return summaryTone(group.summary.passing, group.summary.total)
  if (group.type === 'aggregate')
    return group.passed ? 'success' : group.actual > 0 ? 'warning' : 'danger'
  return 'danger'
}

function GroupHeader({
  group,
  groupMetadata,
}: {
  group: Group
  groupMetadata: { label: string; description: string } | undefined
}) {
  const label = groupMetadata?.label ?? group.key
  const description = groupMetadata?.description
  const tone = groupTone(group)

  return (
    <div style={{ width: '100%' }}>
      <div style={headerRowStyle}>
        <ReadinessPill tone={tone} />
        <span style={headerTitleStyle}>{label}</span>
        {group.optional ? (
          <span
            style={{
              fontSize: 'calc(var(--base-body-size) * 0.8px)',
              color: 'var(--theme-elevation-500)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Optional
          </span>
        ) : null}
      </div>
      {description ? <div style={groupDescriptionStyle}>{description}</div> : null}
      {group.type === 'documents' ? (
        <ProgressBar
          passing={group.summary.passing}
          total={group.summary.total}
          unit="documents ready"
        />
      ) : group.type === 'aggregate' ? (
        <ProgressBar passing={group.actual} total={group.threshold} unit="keys filled" />
      ) : null}
    </div>
  )
}

export const ReadinessGroup: React.FC<ReadinessGroupProps> = ({
  group,
  groupMetadata,
  checksMetadata,
  collectionSlug,
  localeCode,
}) => {
  const checkColumns = useMemo(() => {
    if (group.type !== 'documents') return []
    const seen = new Set<string>()
    const cols: Array<{ key: string; label: string; description?: string }> = []
    for (const doc of group.documents) {
      for (const check of doc.checks) {
        if (seen.has(check.key)) continue
        seen.add(check.key)
        const meta = checksMetadata[check.key]
        cols.push({
          key: check.key,
          label: meta?.label ?? check.key,
          description: meta?.description,
        })
      }
    }
    return cols
  }, [group, checksMetadata])

  const tableRows = useMemo(() => {
    if (group.type !== 'documents') return []
    return group.documents.map((doc) => {
      const idIsSentinel = typeof doc.id === 'string'
      const link =
        collectionSlug !== null && !idIsSentinel
          ? `/admin/collections/${collectionSlug}/${doc.id}?locale=${encodeURIComponent(localeCode)}`
          : undefined
      return { id: doc.id, label: doc.label, link, checks: doc.checks }
    })
  }, [group, collectionSlug, localeCode])

  return (
    <Collapsible header={<GroupHeader group={group} groupMetadata={groupMetadata} />}>
      <div style={groupBodyStyle}>
        {group.type === 'documents' ? (
          <ReadinessTable checkColumns={checkColumns} rows={tableRows} />
        ) : group.type === 'aggregate' ? (
          <AggregateStatus
            actual={group.actual}
            items={group.items}
            passed={group.passed}
            threshold={group.threshold}
          />
        ) : (
          <ErroredStatus error={group.error} />
        )}
      </div>
    </Collapsible>
  )
}
