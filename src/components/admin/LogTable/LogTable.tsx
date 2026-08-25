'use client'

import type { FieldClientComponent, JSONFieldClient } from 'payload'

import {
  Drawer,
  FieldDescription,
  FieldLabel,
  Table,
  useDrawerSlug,
  useField,
  useModal,
} from '@payloadcms/ui'
import { toWords } from 'payload/shared'
import React, { useState } from 'react'

import type { LogCell, LogColumn, LogEntry } from '@/fields/logField'
import { asLog } from '@/fields/logField'

import { tableColumn } from '../tableColumn'

import './styles.css'

/**
 * The renderer for every {@link logField} — what happened to this document,
 * when, and whatever else the entry chose to say.
 *
 * **The columns are the field's**, declared by `logField` and delivered in
 * `admin.custom`. That is what lets one component serve a verification cycle
 * (Event / Who / Delivery) and a registrant's mail (Event / Sent to) without
 * either being flattened into the other's shape. With none declared it falls
 * back to the **union** of the entries' `cells` — the union rather than the
 * newest entry, because a log whose latest entry is a cancellation would
 * otherwise drop the recipient column and hide it for every email above.
 *
 * Only `cells` renders as columns. The rest of an entry is machine data a job
 * reads back (a reminder carries its stage, level, role and recipient id), and
 * rendering those turned the verification log into fourteen columns of raw enum
 * values. It isn't lost: **clicking a row** opens the whole entry as JSON in a
 * `Drawer`, which answers "why did that go there?" when no column says.
 *
 * Two earlier shapes are worth not repeating. A trailing ⋯ column sat at the
 * far right of the table's horizontal scroll area, so on a narrow window the
 * details were present and unreachable. A hover panel reached them at any
 * width, but opened and closed as the pointer crossed the table — motion
 * nobody asked for while reading. A click is deliberate, and Payload's own
 * `Drawer` handles the overlay, focus trap and dismissal.
 *
 * `Table` takes only `columns` and `data` — it exposes nothing per row, so the
 * click is **one delegated listener** on the wrapper, which resolves the row
 * with `closest('tr[data-id]')`. Payload writes our own array index into
 * `data-id`, so the row is identifiable without owning the `<tr>`; the cursor
 * is the one thing that has to be a stylesheet rule, for the same reason.
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

  const [selected, setSelected] = useState<number | null>(null)
  const drawerSlug = useDrawerSlug('log-entry')
  const { openModal } = useModal()

  /** Resolve the clicked row and open its entry. */
  const openRow = (target: EventTarget | null) => {
    const row = (target as HTMLElement | null)?.closest?.('tr[data-id]')
    if (!(row instanceof HTMLElement)) return
    const index = Number(row.dataset.id)
    if (!Number.isInteger(index)) return
    setSelected(index)
    openModal(drawerSlug)
  }

  return (
    <div className="field-type json read-only">
      <FieldLabel label={label} path={name} />
      <div className="field-type__wrap">
        {entries.length === 0 ? (
          <div style={emptyStyle}>Nothing recorded yet.</div>
        ) : (
          <div
            className="log-table"
            // One delegated listener rather than per-cell handlers: it covers
            // the whole row including its padding, and needs no extra markup
            // inside Payload's cells.
            onClick={(event) => openRow(event.target)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') openRow(event.target)
            }}
          >
            <Table
              appearance="condensed"
              data={entries.map((_, index) => ({ id: index }))}
              columns={[
                tableColumn(
                  'when',
                  'When',
                  // The one tab stop per row — the keyboard's way in.
                  entries.map((entry, index) => (
                    <span key={index} tabIndex={0} style={focusableStyle}>
                      {formatLogDate(entry.at)}
                    </span>
                  )),
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
              ]}
            />
            {selected !== null ? (
              <Drawer slug={drawerSlug} title="Activity entry">
                <pre style={jsonStyle}>{JSON.stringify(entries[selected], null, 2)}</pre>
              </Drawer>
            ) : null}
          </div>
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

/** The keyboard entry point; the focus ring is the browser's own. */
const focusableStyle: React.CSSProperties = { display: 'inline-block' }
/**
 * The drawer scrolls itself, so this must not: nesting a scrolling `<pre>`
 * inside a scrolling container gave two scrollbars on one panel, and a wheel
 * gesture that moved whichever the pointer happened to be over.
 */
const jsonStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '12px',
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  color: 'var(--theme-elevation-800)',
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
