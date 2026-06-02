'use client'

import React, { useMemo, useState } from 'react'

import { buildGroupView, type ReadinessGroup as Group } from '@/lib/status'

import { ErroredStatus } from './ErroredStatus'
import { ReadinessPill } from './ReadinessPill'
import { ReadinessTable, type CheckColumn, type ReadinessTableRow } from './ReadinessTable'
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

// Tone is presentation derived from the baked `counter` fact: optional groups
// read neutral; an absent counter (errored) or an empty/unmet total reads danger;
// otherwise the success/warning/danger gradient follows the ratio.
function groupTone(group: Group): SummaryTone {
  if (group.optional) return 'neutral'
  if (!group.counter || group.counter.total === 0) return 'danger'
  return summaryTone(group.counter.current, group.counter.total)
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

  const counterValues = group.counter

  return (
    <div
      role="button"
      tabIndex={0}
      style={{
        ...headerWrapStyle,
        paddingTop: 'calc(var(--base) * 0.5)',
        paddingBottom: 'calc(var(--base) * 0.5)',
        borderBottom: '1px dashed var(--theme-elevation-200)',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle()
        }
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
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
              }}
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

  // All row/column summarization lives in the data layer (`buildGroupView`).
  // The component only joins column labels (from metadata) and resolves each
  // row's link-target to an admin URL — both genuine view-layer concerns.
  const { checkColumns, tableRows } = useMemo(() => {
    const view = buildGroupView(group, {
      rowDisplay: groupMetadata?.rowDisplay,
      groupLabel: groupMetadata?.label ?? 'items',
    })

    const checkColumns: CheckColumn[] = view.columns.map((key) => {
      const meta = checksMetadata[key]
      return { key, label: meta?.label ?? key, description: meta?.description }
    })

    const collectionListLink =
      collectionSlug !== null
        ? `/admin/collections/${collectionSlug}?locale=${encodeURIComponent(localeCode)}`
        : undefined
    const globalLink =
      groupGlobalSlug !== null
        ? `/admin/globals/${groupGlobalSlug}?locale=${encodeURIComponent(localeCode)}`
        : undefined

    const resolveLink = (
      target: (typeof view.rows)[number]['linkTarget'],
      id: string | number,
    ): string | undefined => {
      switch (target) {
        case 'document':
          return collectionSlug !== null && typeof id === 'number'
            ? `/admin/collections/${collectionSlug}/${id}?locale=${encodeURIComponent(localeCode)}`
            : (globalLink ?? collectionListLink)
        case 'list':
          return collectionListLink ?? globalLink
        case 'global':
          return globalLink ?? collectionListLink
      }
    }

    const tableRows: ReadinessTableRow[] = view.rows.map((row) => ({
      id: row.id,
      label: row.label,
      link: resolveLink(row.linkTarget, row.id),
      checks: row.checks,
      ...(row.kind === 'summary' ? { isSummary: true as const } : {}),
      ...(row.kind === 'missing' ? { isMissing: true as const } : {}),
    }))

    return { checkColumns, tableRows }
  }, [group, checksMetadata, collectionSlug, groupGlobalSlug, groupMetadata, localeCode])

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
          {group.type === 'documents' || group.type === 'aggregate' ? (
            <ReadinessTable checkColumns={checkColumns} rows={tableRows} />
          ) : (
            <ErroredStatus error={group.error} />
          )}
        </div>
      ) : null}
    </div>
  )
}
