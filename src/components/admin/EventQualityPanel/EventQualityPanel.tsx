'use client'

import type { ChecksMetadata, PanelItem } from './model'
import type { JSONFieldClientComponent } from 'payload'

import { Banner, Collapsible, InfoIcon, Pill, SuccessIcon, useField } from '@payloadcms/ui'
import React from 'react'



import { ProgressBar } from '@/components/admin/ReadinessField/ProgressBar'
import { StatusIcon } from '@/components/admin/ReadinessField/StatusIcon'
import { summaryTone } from '@/components/admin/ReadinessField/summary'
import type { EventQualityReport, QualitySkipReason } from '@/lib/eventQuality/types'

import { buildPanelModel } from './model'

const HEADING = 'Listing recommendations'

/**
 * A pending item — a language added in this very save. Rendered neutrally
 * rather than with the failing icon, because there is nothing to fix yet.
 */
const PendingIcon: React.FC = () => (
  <span
    aria-label="Pending"
    role="img"
    title="Pending — save the event, then add the translation"
    style={{
      display: 'inline-block',
      width: '16px',
      height: '16px',
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

const CheckRow: React.FC<{ item: PanelItem }> = ({ item }) => (
  <li
    style={{
      display: 'flex',
      gap: 'calc(var(--base) * 0.4)',
      padding: 'calc(var(--base) * 0.3) 0',
      borderBottom: '1px solid var(--theme-elevation-50)',
      opacity: item.status === 'passed' ? 0.65 : 1,
    }}
  >
    <span style={{ flexShrink: 0, marginTop: '2px' }}>
      {item.status === 'pending' ? (
        <PendingIcon />
      ) : (
        <StatusIcon passed={item.status === 'passed'} />
      )}
    </span>
    <span style={{ minWidth: 0 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 'calc(var(--base) * 0.3)' }}>
        <strong style={{ fontWeight: 600 }}>{item.label}</strong>
        {item.locale ? <Pill size="small">{localeLabel(item.locale)}</Pill> : null}
      </span>
      <span
        style={{
          display: 'block',
          color: 'var(--theme-elevation-500)',
          fontSize: 'calc(var(--base-body-size) * 0.9px)',
        }}
      >
        {item.description}
      </span>
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
 * Advisory listing-quality recommendations on the Event edit view (#609).
 *
 * Replaces the raw JSON rendering of the `qualityReport` virtual field. Never
 * blocks anything — it tells a volunteer manager what would make their listing
 * better, and says so in the manager's own terms rather than as check keys.
 *
 * There is deliberately no refresh control: the report is computed on read, so
 * opening the event is already fresh, and a button that re-saved the document
 * to recompute would write on read and churn `updatedAt` and the version
 * history.
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

  if (model.skipped) {
    // Rendering the reason, not an empty report: "no recommendations" and "not
    // checked because this event is finished" are completely different messages.
    return (
      <Banner type="default" icon={<InfoIcon />} alignIcon="left">
        {custom.skipReasonLabels?.[model.reason] ?? 'This listing isn’t being checked right now.'}
      </Banner>
    )
  }

  const open = model.groups
    .map((group) => ({ ...group, items: group.items.filter((i) => i.status !== 'passed') }))
    .filter((group) => group.items.length > 0)
  const passing = model.groups.flatMap((group) => group.items.filter((i) => i.status === 'passed'))

  return (
    <div style={{ marginBottom: 'calc(var(--base) * 0.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'calc(var(--base) * 0.4)' }}>
        <strong style={{ fontWeight: 600, fontSize: '1.15em' }}>{HEADING}</strong>
      </div>
      <ProgressBar
        passing={model.resolved}
        total={model.total}
        unit="checks passing"
        tone={summaryTone(model.resolved, model.total)}
      />

      {model.openCount === 0 && model.pendingCount === 0 ? (
        <div style={{ marginTop: 'calc(var(--base) * 0.5)' }}>
          <Banner type="success" icon={<SuccessIcon />} alignIcon="left">
            This listing has no open recommendations — thank you for keeping it up to date.
          </Banner>
        </div>
      ) : null}

      {open.map((group) => (
        <div key={group.tier} style={{ marginTop: 'calc(var(--base) * 0.6)' }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 'calc(var(--base-body-size) * 0.95px)',
              color: 'var(--theme-elevation-600)',
              marginBottom: 'calc(var(--base) * 0.2)',
            }}
          >
            {group.label}
          </div>
          {itemList(group.items)}
        </div>
      ))}

      {passing.length > 0 ? (
        <div style={{ marginTop: 'calc(var(--base) * 0.6)' }}>
          <Collapsible header={`${passing.length} already in good shape`} initCollapsed>
            {itemList(passing)}
          </Collapsible>
        </div>
      ) : null}
    </div>
  )
}

export default EventQualityPanel
