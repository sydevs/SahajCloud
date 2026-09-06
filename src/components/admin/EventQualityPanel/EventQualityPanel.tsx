'use client'

import type { ChecksMetadata, PanelItem } from './model'
import type { JSONFieldClientComponent } from 'payload'

import { useField } from '@payloadcms/ui'
import React from 'react'



import { StatusIcon } from '@/components/admin/ReadinessField/StatusIcon'
import { summaryTone, toneToColor } from '@/components/admin/ReadinessField/summary'
import type { QualitySkipReason } from '@/lib/eventQuality/types'
import type { EventQualityReport } from '@/payload-types'

import { buildPanelModel } from './model'

const HEADING = 'Recommendations'

/**
 * A pending item — something that cannot be judged yet. Rendered neutrally
 * rather than with the failing icon, because there is nothing to fix.
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
 * One row. An open recommendation carries the sentence saying why it's being
 * made — a manager shouldn't have to hover to find that out. A passing one is
 * a single faded line with a green tick, sitting in the same list directly
 * below the work still to do.
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
        color: passed ? 'var(--theme-elevation-450)' : undefined,
      }}
    >
      <span style={{ flexShrink: 0, position: 'relative', top: '3px' }}>
        {item.status === 'pending' ? <PendingIcon /> : <StatusIcon passed={passed} />}
      </span>
      <span style={{ minWidth: 0 }}>
        {item.label}
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

/**
 * Advisory listing-quality recommendations, in the Event sidebar above Legacy
 * Data (#609).
 *
 * Replaces the raw JSON rendering of the `qualityReport` virtual field. Never
 * blocks anything — it tells a volunteer manager what would make their listing
 * better, in their terms rather than as check keys.
 *
 * Laid out for a ~275px column: one flat list, open recommendations first with
 * their reason, then what already passes as faded single lines. There is
 * deliberately no refresh control — the report is computed on read, so opening
 * the event is already fresh, and a button that re-saved the document to
 * recompute would write on read.
 *
 * All wording comes from `src/lib/eventQuality/copy.ts` via `admin.custom`.
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

  const { fg } = toneToColor(summaryTone(model.resolved, model.total))

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

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {model.items.map((item) => (
          <CheckRow key={item.key} item={item} />
        ))}
      </ul>
    </div>
  )
}

export default EventQualityPanel
