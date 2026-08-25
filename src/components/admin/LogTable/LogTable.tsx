'use client'

import type { FieldClientComponent, JSONFieldClient } from 'payload'

import { FieldDescription, FieldLabel, Table, useField } from '@payloadcms/ui'
import { toWords } from 'payload/shared'
import React from 'react'

import type { LogCell, LogEntry } from '@/fields/logField'
import { asLog } from '@/fields/logField'

import { tableColumn } from '../tableColumn'

/**
 * The renderer for every {@link logField} — what happened to this document,
 * when, and whatever else the entry chose to say.
 *
 * **The entries decide the columns**, through their `cells`. That is what lets
 * one component serve a verification cycle (Activity / Who / Delivery) and a
 * registrant's mail (Activity / Sent to) without either being flattened into
 * the other's shape — and lets a new kind of entry bring a new column with it,
 * without touching this file.
 *
 * Only `cells` renders. The rest of an entry is machine data a job reads back
 * (a reminder carries its stage, level, role and recipient id), and rendering
 * those turned the verification log into fourteen columns of raw enum values.
 *
 * Columns come from the **union** of entries, not the newest one: a log whose
 * latest entry is a cancellation would otherwise drop the recipient column and
 * hide what it holds for every email above it. Order is first-seen scanning
 * newest-first, so the current shape leads and older extras trail it.
 */
export const LogTable: FieldClientComponent = ({ field }) => {
  const { name, label, admin } = field as JSONFieldClient
  const { value } = useField<unknown>()

  // Newest first: a manager opening a document is asking about the last thing
  // that happened. The stored order stays chronological — that's the end the
  // cap trims from.
  const entries = [...asLog(value)].sort((a, b) => b.at.localeCompare(a.at))
  const labels = (admin?.custom?.columnLabels ?? {}) as Record<string, string>

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
              ...columnKeys(entries).map((key) =>
                tableColumn(
                  key,
                  labels[key] ?? toWords(key),
                  entries.map((entry, index) => (
                    <CellView key={index} cell={entry.cells?.[key]} />
                  )),
                ),
              ),
            ]}
          />
        )}
      </div>
      <FieldDescription description={admin?.description} path={name} />
    </div>
  )
}

/** Cell keys across every entry, in the order they first appear. */
function columnKeys(entries: LogEntry[]): string[] {
  const keys: string[] = []
  for (const entry of entries) {
    for (const [key, cell] of Object.entries(entry.cells ?? {})) {
      if (cell == null) continue
      if (!keys.includes(key)) keys.push(key)
    }
  }
  return keys
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
const emptyStyle: React.CSSProperties = {
  color: 'var(--theme-elevation-500)',
  fontStyle: 'italic',
  fontSize: '13px',
}

export default LogTable
