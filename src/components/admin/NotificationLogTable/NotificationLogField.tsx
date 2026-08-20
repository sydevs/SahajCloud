'use client'

import type { FieldClientComponent, JSONFieldClient } from 'payload'

import { FieldDescription, FieldLabel, Table, useField } from '@payloadcms/ui'
import React from 'react'

import type { NotificationLogEntry } from '@/lib/eventVerification/log'

import { tableColumn } from '../tableColumn'
import {
  deliveryCell,
  eventLabel,
  formatLogDate,
  whoCell,
  type DeliveryCell,
  type WhoCell,
} from './format'

/** Muted in-cell label (e.g. a reminder's channel, or the Who sub-line). */
const labelStyle: React.CSSProperties = { color: 'var(--theme-elevation-500)' }
const subStyle: React.CSSProperties = { ...labelStyle, fontSize: '12px' }
const emptyStyle: React.CSSProperties = {
  color: 'var(--theme-elevation-500)',
  fontStyle: 'italic',
  fontSize: '13px',
}

/** Recipient name with an optional muted role · region sub-line. */
function WhoCellView({ cell }: { cell: WhoCell }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span>{cell.name}</span>
      {cell.sub ? <span style={subStyle}>{cell.sub}</span> : null}
    </div>
  )
}

/** Verification method, or a reminder's `channel: destination` (channel muted). */
function DeliveryCellView({ cell }: { cell: DeliveryCell }) {
  if ('method' in cell) return <span>{cell.method}</span>
  return (
    <span>
      <span style={labelStyle}>{cell.channel}:</span> {cell.destination}
    </span>
  )
}

/**
 * Read-only renderer for an event's `notificationLog` (current verification
 * cycle). Uses Payload's own `Table` for native admin styling. Three columns:
 * When (date in words), Event (`Verified` / `Reminder · <stage>`), and a
 * Details cell whose lines vary by entry kind.
 */
export const NotificationLogField: FieldClientComponent = ({ field }) => {
  const { name, label, admin } = field as JSONFieldClient
  const { value } = useField<NotificationLogEntry[]>()
  const entries = Array.isArray(value) ? value : []

  return (
    <div className="field-type json read-only">
      <FieldLabel label={label} path={name} />
      <div className="field-type__wrap">
        {entries.length === 0 ? (
          <div style={emptyStyle}>No verification activity yet.</div>
        ) : (
          <Table
            appearance="condensed"
            data={entries.map((_, index) => ({ id: index }))}
            columns={[
              tableColumn(
                'when',
                'When',
                entries.map((entry) => formatLogDate(entry.at)),
              ),
              tableColumn(
                'event',
                'Event',
                entries.map((entry) => eventLabel(entry)),
              ),
              tableColumn(
                'who',
                'Who',
                entries.map((entry, index) => <WhoCellView key={index} cell={whoCell(entry)} />),
              ),
              tableColumn(
                'delivery',
                'Delivery',
                entries.map((entry, index) => (
                  <DeliveryCellView key={index} cell={deliveryCell(entry)} />
                )),
              ),
            ]}
          />
        )}
      </div>
      <FieldDescription description={admin?.description} path={name} />
    </div>
  )
}

export default NotificationLogField
