'use client'

import type { FieldClientComponent, JSONFieldClient } from 'payload'

import { FieldDescription, FieldLabel, Table, useField } from '@payloadcms/ui'
import { toWords } from 'payload/shared'
import React, { useState } from 'react'

import type { LogCell, LogColumn, LogEntry } from '@/fields/logField'
import { asLog } from '@/fields/logField'

import { tableColumn } from '../tableColumn'

/** Which row's details are open, and where to hang the panel. */
interface ActiveRow {
  index: number
  /** Pixels from the top of the wrapper — just below the row. */
  top: number
}

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
 * values. It isn't lost: **hovering anywhere on a row** opens the whole entry as
 * JSON, which answers "why did that go there?" when no column says.
 *
 * That replaced a trailing ⋯ column, which on a narrow window sat off the right
 * edge of the table's scroll area — the details were present and unreachable.
 * The panel is pinned to both edges of the table instead of to the row, so it
 * cannot repeat that trick at any width.
 *
 * `@payloadcms/ui`'s `Table` takes only `columns` and `data` — it exposes
 * nothing per row, so hover is handled by **one delegated listener** on the
 * wrapper, which resolves the row with `closest('tr')`. Wrapping each cell
 * instead was the first attempt and left the cell *padding* dead: the pointer
 * crossing the gap between two values dismissed the panel. Delegation covers
 * the whole row including its padding, needs no per-cell markup, and still
 * leaves Payload's table to render itself.
 *
 * Payload writes our own array index into `data-id`, which is what makes a row
 * identifiable from the event target without owning the `<tr>`.
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

  const [active, setActive] = useState<ActiveRow | null>(null)

  /** Resolve the row under the pointer (or focus) and open its details. */
  const openRow = (target: EventTarget | null) => {
    const row = (target as HTMLElement | null)?.closest?.('tr[data-id]')
    if (!(row instanceof HTMLElement)) return
    const index = Number(row.dataset.id)
    if (!Number.isInteger(index)) return
    setActive({ index, top: row.offsetTop + row.offsetHeight })
  }

  return (
    <div className="field-type json read-only">
      <FieldLabel label={label} path={name} />
      <div className="field-type__wrap">
        {entries.length === 0 ? (
          <div style={emptyStyle}>Nothing recorded yet.</div>
        ) : (
          <div
            style={wrapperStyle}
            // `mouseOver` rather than `mouseEnter`: it bubbles, so one listener
            // covers every row and every pixel of it.
            onMouseOver={(event) => openRow(event.target)}
            // Focus bubbles too (focusin), so the same listener serves the
            // keyboard — hover alone is unreachable, and this panel is the only
            // route to an entry's machine fields.
            onFocus={(event) => openRow(event.target)}
            // Closing on the wrapper rather than per row keeps the panel open
            // while the pointer travels across the row, and over the panel
            // itself — otherwise its JSON would be unselectable.
            onMouseLeave={() => setActive(null)}
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
            {active ? (
              <div style={{ ...panelStyle, top: active.top }}>
                <pre style={jsonStyle}>{JSON.stringify(entries[active.index], null, 2)}</pre>
              </div>
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

const wrapperStyle: React.CSSProperties = { position: 'relative' }
/** The keyboard entry point; the focus ring is the browser's own. */
const focusableStyle: React.CSSProperties = { display: 'inline-block' }
const panelStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  zIndex: 10,
  background: 'var(--theme-input-bg)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-m)',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
}
/**
 * The **only** scrolling box here. The previous version nested this inside
 * Payload's `Popup`, which scrolls too — two scrollbars on one panel, and a
 * wheel gesture that moved whichever the pointer happened to be over.
 */
const jsonStyle: React.CSSProperties = {
  margin: 0,
  padding: 'calc(var(--base) * 0.5)',
  fontSize: '11px',
  lineHeight: 1.5,
  maxHeight: '320px',
  overflow: 'auto',
  whiteSpace: 'pre',
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
