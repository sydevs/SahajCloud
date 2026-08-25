'use client'

import type { FieldClientComponent, JSONFieldClient } from 'payload'

import { FieldDescription, FieldLabel, Table, useField } from '@payloadcms/ui'
import React from 'react'

import type { LogEntry } from '@/fields/logField'
import { asLog } from '@/fields/logField'

import { formatLogDate } from '../NotificationLogTable/format'
import { tableColumn } from '../tableColumn'

/**
 * The default renderer for a {@link logField} — what was sent, when, and where
 * it went.
 *
 * Written for a manager checking that mail actually went out, so the columns
 * are the three things that answers: **When**, **What** (the entry's own
 * summary, composed by the job that knows why it sent), and **Sent to**.
 * Nothing here interprets the entry — a log that needs domain rendering (the
 * verification log's escalation level and recipient tier) passes its own
 * component to the factory instead of bending this one.
 *
 * Newest first: a manager opening a document is asking about the last thing
 * that happened, not the first. The stored order stays chronological, because
 * that is the order the cap trims from.
 */
export const LogTable: FieldClientComponent = ({ field }) => {
  const { name, label, admin } = field as JSONFieldClient
  const { value } = useField<unknown>()
  const entries = [...asLog(value)].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <div className="field-type json read-only">
      <FieldLabel label={label} path={name} />
      <div className="field-type__wrap">
        {entries.length === 0 ? (
          <div style={emptyStyle}>Nothing sent yet.</div>
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
                'what',
                'What',
                entries.map((entry) => entry.summary || entry.event),
              ),
              tableColumn(
                'sentTo',
                'Sent to',
                entries.map((entry, index) => <SentToCell key={index} entry={entry} />),
              ),
            ]}
          />
        )}
      </div>
      <FieldDescription description={admin?.description} path={name} />
    </div>
  )
}

/**
 * `email: someone@example.com`, channel muted — or an em dash when the entry
 * records something that wasn't a message to anyone.
 */
function SentToCell({ entry }: { entry: LogEntry }) {
  if (!entry.destination) return <span style={mutedStyle}>—</span>
  return (
    <span>
      {entry.channel ? <span style={mutedStyle}>{entry.channel}: </span> : null}
      {entry.destination}
    </span>
  )
}

const mutedStyle: React.CSSProperties = { color: 'var(--theme-elevation-500)' }
const emptyStyle: React.CSSProperties = {
  color: 'var(--theme-elevation-500)',
  fontStyle: 'italic',
  fontSize: '13px',
}

export default LogTable
