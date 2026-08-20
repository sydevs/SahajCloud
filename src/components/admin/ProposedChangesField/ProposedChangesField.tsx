'use client'

import type { FieldClientComponent, JSONFieldClient } from 'payload'

import { FieldLabel, Pill, Table, useField } from '@payloadcms/ui'
import React from 'react'

import type { ProposedChange } from '@/collections/EventSubmissions/lifecycle/proposedChanges'

// The exact element type Payload's Table expects in `columns`.
type ChangeColumn = NonNullable<React.ComponentProps<typeof Table>['columns']>[number]

const emptyStyle: React.CSSProperties = {
  color: 'var(--theme-elevation-500)',
  fontStyle: 'italic',
  fontSize: '13px',
}

const beforeStyle: React.CSSProperties = {
  color: 'var(--theme-elevation-500)',
  textDecoration: 'line-through',
}

const absentStyle: React.CSSProperties = {
  color: 'var(--theme-elevation-400)',
  fontStyle: 'italic',
}

/** Pill styling per change kind — Payload's own palette, no custom colours. */
const KIND_PILL: Record<ProposedChange['kind'], { label: string; style: 'success' | 'warning' }> = {
  added: { label: 'Added', style: 'success' },
  changed: { label: 'Changed', style: 'warning' },
  removed: { label: 'Removed', style: 'warning' },
}

/** A value, or an explicit "empty" marker — blank cells read as a rendering bug. */
function Value({ text, muted }: { text: string | null; muted?: boolean }) {
  if (text == null) return <span style={absentStyle}>empty</span>
  return <span style={muted ? beforeStyle : undefined}>{text}</span>
}

/**
 * Build a Payload `Table` column. The Table only reads
 * `accessor`/`active`/`Heading`/`renderedCells`; `field` is required by the
 * `Column` type but never used at runtime, so a stub satisfies it.
 */
function column(accessor: string, heading: string, cells: React.ReactNode[]): ChangeColumn {
  return { accessor, active: true, Heading: heading, renderedCells: cells, field: {} as never }
}

/**
 * The reviewer's whole job: what this submission would change about the event.
 *
 * Renders the `proposedChanges` virtual field — computed server-side, because
 * the browser has the proposal but not the event it would land on (see
 * `computeReviewFields.ts`). This component only draws it, so the diffing and
 * the labelling stay unit-testable without a DOM.
 *
 * An empty list is meaningful and says so: a proposal that changes nothing is
 * something a manager should be able to reject on sight.
 */
export const ProposedChangesField: FieldClientComponent = ({ field }) => {
  const { name, label } = field as JSONFieldClient
  const { value } = useField<ProposedChange[]>()
  const changes = Array.isArray(value) ? value : []

  return (
    <div className="field-type json read-only">
      <FieldLabel label={label || 'Proposed changes'} path={name} />
      <div className="field-type__wrap">
        {changes.length === 0 ? (
          <div style={emptyStyle}>This submission would not change anything on the event.</div>
        ) : (
          <Table
            appearance="condensed"
            data={changes.map((change) => ({ id: change.path }))}
            columns={[
              column(
                'field',
                'Field',
                changes.map((change) => change.label),
              ),
              column(
                'kind',
                '',
                changes.map((change) => (
                  <Pill key={change.path} pillStyle={KIND_PILL[change.kind].style}>
                    {KIND_PILL[change.kind].label}
                  </Pill>
                )),
              ),
              column(
                'before',
                'Current',
                changes.map((change) => <Value key={change.path} text={change.before} muted />),
              ),
              column(
                'after',
                'Proposed',
                changes.map((change) => <Value key={change.path} text={change.after} />),
              ),
            ]}
          />
        )}
      </div>
    </div>
  )
}

export default ProposedChangesField
