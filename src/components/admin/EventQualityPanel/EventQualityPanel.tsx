'use client'

import type { ChecksMetadata, PanelItem } from './model'
import type { JSONFieldClientComponent } from 'payload'

import { Collapsible, useField } from '@payloadcms/ui'
import React from 'react'

import { StatusIcon } from '@/components/admin/ReadinessField/StatusIcon'
import { summaryTone, toneToColor } from '@/components/admin/ReadinessField/summary'
import type { EventQualityReport, QualitySkipReason } from '@/lib/eventQuality/types'

import { buildPanelModel } from './model'

const HEADING = 'Recommendations'

/**
 * A pending item — a language added in this very save. Rendered neutrally
 * rather than with the failing icon, because there is nothing to fix yet.
 */
const PendingIcon: React.FC = () => (
  <span
    aria-label="Pending"
    role="img"
    style={{
      display: 'inline-block',
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      border: '2px dashed var(--theme-elevation-400)',
    }}
  />
)

/**
 * Render a label, bolding the language where `%{language}` marks it — so the
 * language reads as part of the sentence ("Add a **German** title") instead of
 * as a chip beside it, which said nothing about what it qualified.
 */
const LabelText: React.FC<{ label: string; language?: string }> = ({ label, language }) => {
  if (!language || !label.includes('%{language}')) return <>{label}</>
  const [before, after = ''] = label.split('%{language}')
  return (
    <>
      {before}
      <strong style={{ fontWeight: 600 }}>{language}</strong>
      {after}
    </>
  )
}

/**
 * One row: the recommendation, and — when it's open — the one sentence saying
 * why it's being made. A manager shouldn't have to hover to find that out, so
 * the reason renders inline rather than in a `title`; the passing rows, which
 * are collapsed by default, stay to a single line each.
 */
const CheckRow: React.FC<{ item: PanelItem }> = ({ item }) => {
  const passed = item.status === 'passed'
  return (
    <li
      style={{
        display: 'flex',
        gap: 'calc(var(--base) * 0.3)',
        padding: passed ? 'calc(var(--base) * 0.12) 0' : 'calc(var(--base) * 0.25) 0',
        lineHeight: 1.35,
        fontSize: 'calc(var(--base-body-size) * 0.92px)',
        opacity: passed ? 0.6 : 1,
      }}
    >
      <span style={{ flexShrink: 0, position: 'relative', top: '3px' }}>
        {item.status === 'pending' ? <PendingIcon /> : <StatusIcon passed={passed} />}
      </span>
      <span style={{ minWidth: 0 }}>
        <LabelText label={item.label} language={item.language} />
        {passed ? null : (
          <span
            style={{
              display: 'block',
              marginTop: '1px',
              color: 'var(--theme-elevation-500)',
              fontSize: 'calc(var(--base-body-size) * 0.85px)',
              lineHeight: 1.3,
            }}
          >
            {item.description}
          </span>
        )}
      </span>
    </li>
  )
}

const itemList = (items: PanelItem[]) => (
  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
    {items.map((item) => (
      <CheckRow key={`${item.key}:${item.language ?? 'doc'}`} item={item} />
    ))}
  </ul>
)

/**
 * Advisory listing-quality recommendations, in the Event sidebar above Legacy
 * Data (#609).
 *
 * Replaces the raw JSON rendering of the `qualityReport` virtual field. Never
 * blocks anything — it tells a volunteer manager what would make their listing
 * better, in their terms rather than as check keys.
 *
 * Laid out for a ~275px column: one flat list — five checks doesn't warrant
 * headings — with each open recommendation followed by the one sentence
 * explaining it, and everything already passing folded away behind a count. There is deliberately no refresh
 * control — the report is computed on read, so opening the event is already
 * fresh, and a button that re-saved the document to recompute would write on
 * read.
 */
const EventQualityPanel: JSONFieldClientComponent = ({ field }) => {
  const { value } = useField<EventQualityReport>()
  const custom = (field?.admin?.custom ?? {}) as {
    checksMetadata?: ChecksMetadata
    skipReasonLabels?: Record<QualitySkipReason, string>
  }

  const model = buildPanelModel(value, custom.checksMetadata ?? {})
  // Unsaved document — nothing has been read, so there is nothing to report.
  if (!model) return null

  const heading = (
    <div
      style={{
        fontSize: 'calc(var(--base-body-size) * 0.8px)',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--theme-elevation-500)',
        marginBottom: 'calc(var(--base) * 0.25)',
      }}
    >
      {HEADING}
    </div>
  )

  if (model.skipped) {
    // Rendering the reason, not an empty report: "no recommendations" and "not
    // checked because this event is finished" are completely different messages.
    return (
      <div style={{ marginBottom: 'calc(var(--base) * 0.6)' }}>
        {heading}
        <div
          style={{
            fontSize: 'calc(var(--base-body-size) * 0.9px)',
            color: 'var(--theme-elevation-500)',
            lineHeight: 1.4,
          }}
        >
          {custom.skipReasonLabels?.[model.reason] ?? 'This listing isn’t being checked right now.'}
        </div>
      </div>
    )
  }

  const open = model.items.filter((i) => i.status !== 'passed')
  const passing = model.items.filter((i) => i.status === 'passed')
  const tone = summaryTone(model.resolved, model.total)
  const { fg } = toneToColor(tone)

  return (
    <div style={{ marginBottom: 'calc(var(--base) * 0.6)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'calc(var(--base) * 0.3)',
        }}
      >
        {heading}
        <span
          style={{
            fontSize: 'calc(var(--base-body-size) * 0.8px)',
            fontWeight: 600,
            color: fg,
            whiteSpace: 'nowrap',
          }}
        >
          {model.total === 0 ? '—' : `${Math.round((model.resolved / model.total) * 100)}%`}
        </span>
      </div>

      {model.openCount === 0 && model.pendingCount === 0 ? (
        <div
          style={{
            fontSize: 'calc(var(--base-body-size) * 0.9px)',
            color: 'var(--theme-elevation-500)',
          }}
        >
          Nothing to improve — thank you.
        </div>
      ) : null}

      {open.length > 0 ? (
        <div style={{ marginTop: 'calc(var(--base) * 0.3)' }}>{itemList(open)}</div>
      ) : null}

      {passing.length > 0 ? (
        <div style={{ marginTop: 'calc(var(--base) * 0.4)' }}>
          <Collapsible header={`${passing.length} passing`} initCollapsed>
            {itemList(passing)}
          </Collapsible>
        </div>
      ) : null}
    </div>
  )
}

export default EventQualityPanel
