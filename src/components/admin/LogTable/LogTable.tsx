'use client'

import type { FieldClientComponent, JSONFieldClient } from 'payload'

import { FieldDescription, FieldLabel, Popup, Table, useField } from '@payloadcms/ui'
import { toWords } from 'payload/shared'
import React from 'react'

import type { LogCell, LogColumn, LogEntry } from '@/fields/logField'
import { asLog } from '@/fields/logField'

import { tableColumn } from '../tableColumn'

/**
 * The renderer for every {@link logField} — what happened to this document,
 * when, and whatever else the entry chose to say.
 *
 * **The columns are the field's**, declared by `logField` and delivered in
 * `admin.custom`. That is what lets one component serve a verification cycle
 * (Activity / Who / Delivery) and a registrant's mail (Activity / Sent to)
 * without either being flattened into the other's shape.
 *
 * With none declared it falls back to the **union** of the entries' `cells` —
 * the union rather than the newest entry, because a log whose latest entry is a
 * cancellation would otherwise drop the recipient column and hide what it holds
 * for every email above it.
 *
 * Only `cells` renders as columns. The rest of an entry is machine data a job
 * reads back (a reminder carries its stage, level, role and recipient id), and
 * rendering those turned the verification log into fourteen columns of raw enum
 * values. It isn't lost, though — the row's ⋯ opens the whole entry as JSON,
 * which is the answer to "why did that go there?" when no column says.
 */
export const LogTable: FieldClientComponent = ({ field }) => {
  const { name, label, admin } = field as JSONFieldClient
  const { value } = useField<unknown>()

  // Newest first: a manager opening a document is asking about the last thing
  // that happened. The stored order stays chronological — that's the end the
  // cap trims from.
  const entries = [...asLog(value)].sort((a, b) => b.at.localeCompare(a.at))
  const declared = admin?.custom?.columns as LogColumn[] | undefined
  const columns = declared?.length ? declared : derivedColumns(entries)

  return (
    <div className="field-type json read-only">
      <FieldLabel label={label} path={name} />
      <div className="field-type__wrap">
        {entries.length === 0 ? (
          <div style={emptyStyle}>Nothing recorded yet.</div>
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
              ...columns.map((column) =>
                tableColumn(
                  column.key,
                  column.label ?? toWords(column.key),
                  entries.map((entry, index) => (
                    <CellView key={index} cell={entry.cells?.[column.key]} />
                  )),
                ),
              ),
              tableColumn(
                'details',
                '',
                entries.map((entry, index) => <EntryDetails key={index} entry={entry} />),
              ),
            ]}
          />
        )}
      </div>
      <FieldDescription description={admin?.description} path={name} />
    </div>
  )
}

/** Fallback when the field declares none: every cell key, first-seen order. */
function derivedColumns(entries: LogEntry[]): LogColumn[] {
  const keys: string[] = []
  for (const entry of entries) {
    for (const [key, cell] of Object.entries(entry.cells ?? {})) {
      if (cell == null) continue
      if (!keys.includes(key)) keys.push(key)
    }
  }
  return keys.map((key) => ({ key }))
}

/**
 * The whole entry as JSON, behind a ⋯ in the last column.
 *
 * Columns show what a manager usually needs; this is the escape hatch for the
 * rest — a reminder's escalation level and recipient tier, the stage it was
 * sent for, the exactly-once key. Payload's `Popup` renders into a portal, so
 * a wide JSON block can't stretch the table it hangs off.
 */
function EntryDetails({ entry }: { entry: LogEntry }) {
  return (
    <Popup
      button={<span style={detailsTriggerStyle} aria-label="Show full entry">⋯</span>}
      buttonType="custom"
      horizontalAlign="right"
      render={() => <pre style={jsonStyle}>{JSON.stringify(entry, null, 2)}</pre>}
      showScrollbar
      size="fit-content"
    />
  )
}

/**
 * A cell: plain text, or text with a muted `label` inline before it and/or a
 * muted `sub` line beneath. Those two options are what the verification log's
 * hand-written cells needed — `email: a@b.test` on one line, a recipient's role
 * and region under their name — so one shape replaced both components.
 */
function CellView({ cell }: { cell: LogCell | undefined }) {
  if (cell == null || cell === '') return <span style={mutedStyle}>—</span>
  if (typeof cell === 'string') return <span>{cell}</span>
  if (typeof cell !== 'object' || typeof cell.text !== 'string') {
    // A malformed entry shouldn't blank the row — show what's there.
    return <span style={mutedStyle}>{String(cell)}</span>
  }
  return (
    <div style={stackStyle}>
      <span>
        {cell.label ? <span style={mutedStyle}>{cell.label}: </span> : null}
        {cell.text}
      </span>
      {cell.sub ? <span style={subStyle}>{cell.sub}</span> : null}
    </div>
  )
}

/** `21 Jul 2026, 14:30` — compact, unambiguous, and stable across deploys. */
function formatLogDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const mutedStyle: React.CSSProperties = { color: 'var(--theme-elevation-500)' }
const subStyle: React.CSSProperties = { ...mutedStyle, fontSize: '12px' }
const stackStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column' }
const detailsTriggerStyle: React.CSSProperties = {
  cursor: 'pointer',
  color: 'var(--theme-elevation-500)',
  padding: '0 4px',
  letterSpacing: '1px',
}
const jsonStyle: React.CSSProperties = {
  margin: 0,
  padding: 'calc(var(--base) * 0.5)',
  fontSize: '11px',
  lineHeight: 1.5,
  maxHeight: '360px',
  maxWidth: '460px',
  overflow: 'auto',
  whiteSpace: 'pre',
  color: 'var(--theme-elevation-800)',
}
const emptyStyle: React.CSSProperties = {
  color: 'var(--theme-elevation-500)',
  fontStyle: 'italic',
  fontSize: '13px',
}

export default LogTable
