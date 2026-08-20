'use client'

import type { FieldClientComponent, JSONFieldClient } from 'payload'

import { FieldLabel, useField } from '@payloadcms/ui'
import React from 'react'

/** What the widget collected from the person sending the proposal in. */
interface SubmitterInfo {
  name?: string | null
  email?: string | null
  note?: string | null
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'calc(var(--base) * 0.4)',
  alignItems: 'baseline',
}

const labelStyle: React.CSSProperties = {
  color: 'var(--theme-elevation-500)',
  fontSize: '12px',
  minWidth: '4.5rem',
}

const noteStyle: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  marginTop: 'calc(var(--base) * 0.3)',
  color: 'var(--theme-elevation-800)',
}

const emptyStyle: React.CSSProperties = {
  color: 'var(--theme-elevation-500)',
  fontStyle: 'italic',
  fontSize: '13px',
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>{label}</span>
      <span>{value}</span>
    </div>
  )
}

/**
 * Who sent this proposal in — shown separately from what they proposed, and
 * read-only: the reviewer is judging a submission, not correcting the
 * submitter's details.
 *
 * The resolved `submitter` user record is a relationship in the System drawer;
 * this renders the raw strings as typed, which is what matters when deciding
 * whether a submission is plausible.
 */
export const SubmitterPanel: FieldClientComponent = ({ field }) => {
  const { name, label } = field as JSONFieldClient
  const { value } = useField<SubmitterInfo | null>()
  const info = (value ?? {}) as SubmitterInfo

  const contact = [info.name, info.email].filter(Boolean).length > 0

  return (
    <div className="field-type json read-only">
      <FieldLabel label={label || 'Submitted by'} path={name} />
      <div className="field-type__wrap">
        {!contact && !info.note ? (
          <div style={emptyStyle}>No submitter details were recorded.</div>
        ) : (
          <div>
            {info.name ? <Row label="Name" value={info.name} /> : null}
            {info.email ? <Row label="Email" value={info.email} /> : null}
            {info.note ? <div style={noteStyle}>“{info.note}”</div> : null}
          </div>
        )}
      </div>
    </div>
  )
}

export default SubmitterPanel
