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
  groupMetadata:
    | {
        label: string
        description: string
        rowDisplay?: 'all' | 'summarize-excess' | 'collapse-passing'
      }
    | undefined
  checksMetadata: Record<string, { label: string; description: string }>
  collectionSlug: string | null
  groupGlobalSlug: string | null
  localeCode: string
}

function groupTone(group: Group): SummaryTone {
  if (group.optional) return 'neutral'
  if (group.type === 'documents') {
    // Zero documents is a failure, not neutral — there's nothing to pass.
    if (group.summary.total === 0) return 'danger'
    return summaryTone(group.summary.passing, group.summary.total)
  }
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

  let counterValues: { current: number; total: number } | null = null
  if (group.type === 'documents') {
    counterValues = { current: group.summary.passing, total: group.summary.total }
  } else if (group.type === 'aggregate') {
    counterValues = { current: Math.min(group.actual, group.threshold), total: group.threshold }
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
            {counterValues !== null ? (
              <span
                style={{
                  fontSize: '1.25em',
                  color: 'var(--theme-elevation-600)',
                  whiteSpace: 'nowrap',
                }}
              >
                {counterValues.current === counterValues.total ? (
                  `${counterValues.current} of ${counterValues.total}`
                ) : (
                  <>
                    <strong style={{ color: 'var(--theme-elevation-800)' }}>
                      {counterValues.current}
                    </strong>
                    {' of '}
                    {counterValues.total}
                  </>
                )}
              </span>
            ) : null}
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
  groupGlobalSlug,
  localeCode,
}) => {
  const tone = groupTone(group)
  const [showDetails, setShowDetails] = useState(tone !== 'success')

  const checkColumns = useMemo(() => {
    const seen = new Set<string>()
    const cols: Array<{ key: string; label: string; description?: string }> = []

    let checkSources: Array<{ key: string }[]> = []
    if (group.type === 'documents') {
      checkSources = group.documents.map((d) => d.checks)
    } else if (group.type === 'aggregate' && group.items) {
      checkSources = group.items.map((i) => i.checks)
    }

    for (const checks of checkSources) {
      for (const check of checks) {
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
    const collectionListLink =
      collectionSlug !== null
        ? `/admin/collections/${collectionSlug}?locale=${encodeURIComponent(localeCode)}`
        : undefined
    const globalLink =
      groupGlobalSlug !== null
        ? `/admin/globals/${groupGlobalSlug}?locale=${encodeURIComponent(localeCode)}`
        : undefined
    // Link used for "Missing" placeholder rows — prefer collection list (create destination).
    const missingLink = collectionListLink ?? globalLink

    if (group.type === 'documents') {
      if (group.documents.length === 0) {
        return [
          {
            id: '__missing_0',
            label: 'Missing',
            link: missingLink,
            checks: [],
            isMissing: true as const,
          },
        ]
      }
      return group.documents.map((doc) => {
        // String IDs are sentinels (globals, config slots) — link to global, not a per-doc page.
        const isDocId = typeof doc.id === 'number'
        const link =
          collectionSlug !== null && isDocId
            ? `/admin/collections/${collectionSlug}/${doc.id}?locale=${encodeURIComponent(localeCode)}`
            : (globalLink ?? collectionListLink)
        return { id: doc.id, label: doc.label, link, checks: doc.checks }
      })
    }

    if (group.type === 'aggregate' && group.items) {
      const buildItemRow = (item: (typeof group.items)[number]) => {
        // Numeric IDs link to the individual document; string IDs (like translation
        // keys) link to the global where they can be edited.
        const link =
          collectionSlug !== null && typeof item.id === 'number'
            ? `/admin/collections/${collectionSlug}/${item.id}?locale=${encodeURIComponent(localeCode)}`
            : (globalLink ?? collectionListLink)
        return { id: item.id, label: item.label, link, checks: item.checks }
      }

      // Missing rows represent uncreated items needed to reach the threshold.
      const missingCount = Math.max(0, group.threshold - group.items.length)
      const missingRows = Array.from({ length: missingCount }, (_, i) => ({
        id: `__missing_${i}`,
        label: 'Missing',
        link: missingLink,
        checks: checkColumns.map((col) => ({ key: col.key, passed: false })),
        isMissing: true as const,
      }))

      const rowDisplay = groupMetadata?.rowDisplay ?? 'all'
      const failingItems = group.items.filter((item) => !item.checks.every((c) => c.passed))
      const passingItems = group.items.filter((item) => item.checks.every((c) => c.passed))
      const groupLabel = (groupMetadata?.label ?? 'items').toLowerCase()

      if (rowDisplay === 'summarize-excess') {
        // Show all failing rows + up to `threshold` passing rows. Summarize excess.
        const excessPassingCount = Math.max(0, passingItems.length - group.threshold)
        const shownPassingItems = passingItems.slice(0, group.threshold)
        const rows = [...failingItems.map(buildItemRow), ...shownPassingItems.map(buildItemRow)]
        if (excessPassingCount > 0) {
          rows.push({
            id: '__excess_summary',
            label: `${excessPassingCount} additional ${groupLabel} satisfy this requirement`,
            link: collectionListLink ?? globalLink,
            checks: [],
            isSummary: true as const,
          })
        }
        return [...rows, ...missingRows]
      }

      if (rowDisplay === 'collapse-passing') {
        // Show only failing rows; collapse all passing rows into one summary row.
        const rows = failingItems.map(buildItemRow)
        if (passingItems.length > 0) {
          rows.push({
            id: '__passing_summary',
            label: `${passingItems.length} of ${group.items.length} ${groupLabel} passing`,
            link: globalLink ?? collectionListLink,
            checks: [],
            isSummary: true as const,
          })
        }
        return [...rows, ...missingRows]
      }

      // 'all': show every item row followed by missing placeholder rows.
      return [...group.items.map(buildItemRow), ...missingRows]
    }

    return []
  }, [group, checkColumns, collectionSlug, groupGlobalSlug, groupMetadata, localeCode])

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
            group.items ? (
              <ReadinessTable checkColumns={checkColumns} rows={tableRows} />
            ) : (
              <AggregateStatus
                actual={group.actual}
                passed={group.passed}
                threshold={group.threshold}
              />
            )
          ) : (
            <ErroredStatus error={group.error} />
          )}
        </div>
      ) : null}
    </div>
  )
}
