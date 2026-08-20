'use client'

import type { FieldClientComponent, JSONFieldClient } from 'payload'

import { FieldLabel, Pill, useField } from '@payloadcms/ui'
import React from 'react'

import type { ProposedChange } from '@/collections/EventSubmissions/lifecycle/proposedChanges'

import './styles.css'

/** Pill styling per change kind — Payload's own palette, no custom colours. */
const KIND_PILL: Record<ProposedChange['kind'], { label: string; style: 'success' | 'warning' }> = {
  added: { label: 'Added', style: 'success' },
  changed: { label: 'Changed', style: 'warning' },
  removed: { label: 'Removed', style: 'warning' },
}

/** One `-`/`+` row. `null` renders the word "empty" rather than a blank line. */
function DiffLine({ kind, text }: { kind: 'removed' | 'added'; text: string | null }) {
  return (
    <div className={`proposed-changes__line proposed-changes__line--${kind}`}>
      <span className="proposed-changes__marker">{kind === 'removed' ? '−' : '+'}</span>
      <span>{text ?? 'empty'}</span>
    </div>
  )
}

/**
 * The reviewer's whole job: what this submission would change about the event.
 *
 * Rendered as a **unified** diff — label, then the current value struck out in
 * red above the proposed value in green — rather than side-by-side columns.
 * With live preview open this field gets about a third of the window, and a
 * current/proposed table wrapped every value onto three lines there.
 *
 * Draws the `proposedChanges` virtual field, which is computed server-side
 * because the browser has the proposal but not the event it would land on (see
 * `computeReviewFields.ts`). Keeping the diffing and labelling there leaves
 * this component free of logic and unit-testable without a DOM.
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
          <div className="proposed-changes__empty">
            This submission would not change anything on the event.
          </div>
        ) : (
          changes.map((change) => (
            <div className="proposed-changes__entry" key={change.path}>
              <div className="proposed-changes__label">
                <span>{change.label}</span>
                <Pill pillStyle={KIND_PILL[change.kind].style}>{KIND_PILL[change.kind].label}</Pill>
              </div>
              {/* An addition has no "before" worth a struck-out `empty` line,
                  and a removal has no "after" — show only the side that says
                  something. */}
              {change.kind !== 'added' && <DiffLine kind="removed" text={change.before} />}
              {change.kind !== 'removed' && <DiffLine kind="added" text={change.after} />}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ProposedChangesField
