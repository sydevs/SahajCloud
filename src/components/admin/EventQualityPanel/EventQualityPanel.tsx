'use client'

import type { ChecksMetadata, PanelItem } from './model'
import type { JSONFieldClientComponent } from 'payload'

import { Collapsible, Pill, useField } from '@payloadcms/ui'
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

const localeLabel = (locale: string): string => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale
  } catch {
    return locale
  }
}

/**
 * One finding, on one line.
 *
 * The explanation rides in `title` rather than rendering inline: the sidebar is
 * ~275px wide, and a paragraph under every item pushed the whole panel past a
 * screen height. Payload's `Tooltip` isn't used because it's `display: none`
 * below 1024px — exactly the widths where the sidebar collapses under the form
 * and this needs to keep working.
 */
const CheckRow: React.FC<{ item: PanelItem }> = ({ item }) => (
  <li
    title={item.description}
    style={{
      display: 'flex',
      alignItems: 'baseline',
      gap: 'calc(var(--base) * 0.3)',
      padding: 'calc(var(--base) * 0.12) 0',
      lineHeight: 1.35,
      fontSize: 'calc(var(--base-body-size) * 0.92px)',
      opacity: item.status === 'passed' ? 0.6 : 1,
    }}
  >
    <span style={{ flexShrink: 0, position: 'relative', top: '2px' }}>
      {item.status === 'pending' ? (
        <PendingIcon />
      ) : (
        <StatusIcon passed={item.status === 'passed'} />
      )}
    </span>
    <span style={{ minWidth: 0 }}>
      {item.label}
      {item.locale ? (
        <>
          {' '}
          <Pill size="small">{localeLabel(item.locale)}</Pill>
        </>
      ) : null}
    </span>
  </li>
)

const itemList = (items: PanelItem[]) => (
  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
    {items.map((item) => (
      <CheckRow key={`${item.key}:${item.locale ?? 'doc'}`} item={item} />
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
 * Laid out for a ~275px column: one line per finding, tier headings as small
 * caps, explanations on hover, and everything already passing folded away. There
 * is deliberately no refresh control — the report is computed on read, so
 * opening the event is already fresh, and a button that re-saved the document to
 * recompute would write on read.
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

  const open = model.groups
    .map((group) => ({ ...group, items: group.items.filter((i) => i.status !== 'passed') }))
    .filter((group) => group.items.length > 0)
  const passing = model.groups.flatMap((group) => group.items.filter((i) => i.status === 'passed'))
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
          {model.resolved}/{model.total}
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

      {open.map((group) => (
        <div key={group.tier} style={{ marginTop: 'calc(var(--base) * 0.35)' }}>
          <div
            style={{
              fontSize: 'calc(var(--base-body-size) * 0.78px)',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--theme-elevation-400)',
            }}
          >
            {group.label}
          </div>
          {itemList(group.items)}
        </div>
      ))}

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
