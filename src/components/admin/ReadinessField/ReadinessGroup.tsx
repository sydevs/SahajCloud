'use client'

import React, { useMemo, useState } from 'react'

import type { ReadinessGroup as Group } from '@/lib/status'

import { AggregateStatus } from './AggregateStatus'
import { ErroredStatus } from './ErroredStatus'
import { ReadinessPill } from './ReadinessPill'
import { ReadinessTable } from './ReadinessTable'
import {
  groupTitleStyle,
  headerContentStyle,
  headerInlineDescStyle,
  headerRowStyle,
  headerWrapStyle,
} from './styles'
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
  tone,
  showDetails,
  onToggle,
}: {
  group: Group
  groupMetadata: { label: string; description: string } | undefined
  tone: SummaryTone
  showDetails: boolean
  onToggle: () => void
}) {
  const label = groupMetadata?.label ?? group.key
  const description = groupMetadata?.description

  let counter: string | null = null
  if (group.type === 'documents') {
    counter = `${group.summary.passing} of ${group.summary.total}`
  } else if (group.type === 'aggregate') {
    counter = `${group.actual} of ${group.threshold}`
  }

  return (
    <div
      style={{
        ...headerWrapStyle,
        paddingTop: 'calc(var(--base) * 0.5)',
        paddingBottom: 'calc(var(--base) * 0.5)',
        borderBottom: '1px dashed var(--theme-elevation-200)',
      }}
    >
      <ReadinessPill tone={tone} />
      <div style={headerContentStyle}>
        <div style={headerRowStyle}>
          <span
            style={{
              ...groupTitleStyle,
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block',
            }}
          >
            {label}
            {group.optional ? (
              <span
                style={{
                  fontSize: 'calc(var(--base-body-size) * 0.8px)',
                  color: 'var(--theme-elevation-500)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {' '}
                Optional
              </span>
            ) : null}
            {description ? <span style={headerInlineDescStyle}> · {description}</span> : null}
          </span>
          <div
            style={{
              flexShrink: 0,
              marginLeft: 'calc(var(--base) * 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: 'calc(var(--base) * 0.5)',
            }}
          >
            {counter !== null ? <span style={groupTitleStyle}>{counter}</span> : null}
            <button
              type="button"
              onClick={onToggle}
              style={{
                padding: 0,
                border: 'none',
                background: 'none',
                color: 'var(--theme-elevation-600)',
                cursor: 'pointer',
                fontSize: 'calc(var(--base-body-size) * 0.9px)',
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
              }}
            >
              {showDetails ? 'Hide details' : 'Show details'}
            </button>
          </div>
        </div>
      </div>
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
  const tone = groupTone(group)
  const [showDetails, setShowDetails] = useState(tone !== 'success')

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
    <div style={{ marginBottom: 'calc(var(--base) * 0.5)' }}>
      <GroupHeader
        group={group}
        groupMetadata={groupMetadata}
        showDetails={showDetails}
        tone={tone}
        onToggle={() => setShowDetails((v) => !v)}
      />
      {showDetails ? (
        <div style={{ paddingTop: 'calc(var(--base) * 0.3)' }}>
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
      ) : null}
    </div>
  )
}
