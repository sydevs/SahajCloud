'use client'

import type { FieldClientComponent, JSONFieldClient } from 'payload'

import { FieldLabel, useField } from '@payloadcms/ui'
import React from 'react'

import type { ProposedChange } from '@/collections/EventSubmissions/lifecycle/proposedChanges'

import './styles.css'

/**
 * Only a *changed* field is named as such. An addition shows a single green
 * line and a removal a single red one — saying so again beside the field name
 * is noise on the states that were never ambiguous.
 */
const CHANGED_SUFFIX = ' — Changed'

/** One `−`/`+` row. `null` renders the word "empty" rather than a blank line. */
function DiffLine({ kind, text }: { kind: 'removed' | 'added'; text: string | null }) {
  return (
    <div className={`proposed-changes__line proposed-changes__line--${kind}`}>
      <span className="proposed-changes__marker">{kind === 'removed' ? '−' : '+'}</span>
      <span>{text ?? 'empty'}</span>
    </div>
  )
}

/**
 * A long value rendered once, with only the edited words highlighted — the
 * whole point of the word-level diff. Showing a rewritten paragraph as two
 * full copies leaves the reader to spot the difference themselves.
 */
function WordDiff({ change }: { change: ProposedChange }) {
  return (
    <div className="proposed-changes__line proposed-changes__line--words">
      <span>
        {change.segments?.map((segment, index) => (
          <span
            key={index}
            className={
              segment.kind === 'same' ? undefined : `proposed-changes__word--${segment.kind}`
            }
          >
            {segment.text}
          </span>
        ))}
      </span>
    </div>
  )
}

/**
 * The reviewer's whole job: what this submission would change about the event.
 *
 * Rendered as a **unified** diff — the current value struck out in red above
 * the proposed value in green — rather than side-by-side columns. With live
 * preview open this field gets about a third of the window, and a
 * current/proposed table wrapped every value onto three lines there.
 *
 * Long values (a description) collapse to a single line with just the edited
 * words highlighted; short ones stay as two lines, which is quicker to compare.
 *
 * Draws the `proposedChanges` virtual field, computed server-side because the
 * browser has the proposal but not the event it would land on (see
 * `computeReviewFields.ts`). Keeping the diffing there leaves this component
 * free of logic and unit-testable without a DOM.
 */
export const EventSubmissionChanges: FieldClientComponent = ({ field }) => {
  const { name, label } = field as JSONFieldClient
  const { value } = useField<ProposedChange[]>()
  const changes = Array.isArray(value) ? value : []

  return (
    <div className="field-type json read-only">
      <FieldLabel label={label} path={name} />
      <div className="field-type__wrap">
        {changes.length === 0 ? (
          <div className="proposed-changes__empty">
            This submission would not change anything on the event.
          </div>
        ) : (
          changes.map((change) => (
            <div className="proposed-changes__entry" key={change.path}>
              <div className="proposed-changes__label">
                {change.label}
                {change.kind === 'changed' && (
                  <span className="proposed-changes__kind">{CHANGED_SUFFIX}</span>
                )}
              </div>
              {change.segments ? (
                <WordDiff change={change} />
              ) : (
                <>
                  {/* An addition has no "before" worth a struck-out `empty`
                      line, and a removal has no "after" — show only the side
                      that says something. */}
                  {change.kind !== 'added' && <DiffLine kind="removed" text={change.before} />}
                  {change.kind !== 'removed' && <DiffLine kind="added" text={change.after} />}
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default EventSubmissionChanges
