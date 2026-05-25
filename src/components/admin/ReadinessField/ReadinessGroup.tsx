'use client'

import { Collapsible } from '@payloadcms/ui'
import React from 'react'

import type { ReadinessGroup as Group } from '@/lib/status'

import { AggregateStatus } from './AggregateStatus'
import { DocumentsTable } from './DocumentsTable'
import { ErroredStatus } from './ErroredStatus'
import { groupBodyStyle, groupDescriptionStyle, headerRowStyle, headerTitleStyle } from './styles'
import { SummaryBadge } from './SummaryBadge'

interface ReadinessGroupProps {
  group: Group
  groupMetadata: { label: string; description: string } | undefined
  checksMetadata: Record<string, { label: string; description: string }>
  collectionSlug: string | null
  localeCode: string
}

function GroupHeader({
  group,
  groupMetadata,
}: {
  group: Group
  groupMetadata: { label: string; description: string } | undefined
}) {
  const label = groupMetadata?.label ?? group.key
  let badge: React.ReactNode = null
  if (group.type === 'documents') {
    badge = (
      <SummaryBadge passing={group.summary.passing} total={group.summary.total} />
    )
  } else if (group.type === 'aggregate') {
    badge = (
      <SummaryBadge
        passing={group.actual}
        total={group.threshold}
        tone={group.passed ? 'success' : 'danger'}
      />
    )
  } else {
    badge = <SummaryBadge passing={0} total={1} tone="danger" />
  }
  return (
    <div style={headerRowStyle}>
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
      <span style={{ marginLeft: 'auto' }}>{badge}</span>
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
  const description = groupMetadata?.description
  return (
    <Collapsible header={<GroupHeader group={group} groupMetadata={groupMetadata} />}>
      <div style={groupBodyStyle}>
        {description ? <div style={groupDescriptionStyle}>{description}</div> : null}
        {group.type === 'documents' ? (
          <DocumentsTable
            documents={group.documents}
            checksMetadata={checksMetadata}
            collectionSlug={collectionSlug}
            localeCode={localeCode}
          />
        ) : group.type === 'aggregate' ? (
          <AggregateStatus
            actual={group.actual}
            threshold={group.threshold}
            passed={group.passed}
          />
        ) : (
          <ErroredStatus error={group.error} />
        )}
      </div>
    </Collapsible>
  )
}
