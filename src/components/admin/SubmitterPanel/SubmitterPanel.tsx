'use client'

import type { FieldClientComponent, JSONFieldClient } from 'payload'

import { FieldLabel, useField } from '@payloadcms/ui'
import React from 'react'

import './styles.css'

/** What the widget collected from the person sending the proposal in. */
interface SubmitterInfo {
  name?: string | null
  email?: string | null
  note?: string | null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * Who sent this proposal in — shown separately from what they proposed, and
 * read-only: the reviewer is judging a submission, not correcting the
 * submitter's details.
 *
 * The note renders as a **quotation** — indented behind a rule, italic, and
 * attributed — because it is a stranger's own words, and a reviewer weighing
 * whether a submission is plausible needs to see that at a glance. Rendered
 * as a plain line it read as the CMS talking.
 *
 * The resolved `submitter` user record is a relationship in the System drawer;
 * this shows the raw strings as typed, which is what matters when deciding
 * whether a submission is genuine.
 */
export const SubmitterPanel: FieldClientComponent = ({ field }) => {
  const { name, label } = field as JSONFieldClient
  const { value } = useField<SubmitterInfo | null>()
  const info = (value ?? {}) as SubmitterInfo

  const submitterName = text(info.name)
  const email = text(info.email)
  const note = text(info.note)

  return (
    <div className="field-type json read-only">
      <FieldLabel label={label || 'Submitted by'} path={name} />
      <div className="field-type__wrap">
        {!submitterName && !email && !note ? (
          <div className="submitter-panel__empty">No submitter details were recorded.</div>
        ) : (
          <>
            <div className="submitter-panel__identity">
              {submitterName && <span className="submitter-panel__name">{submitterName}</span>}
              {email && (
                <a className="submitter-panel__email" href={`mailto:${email}`}>
                  {email}
                </a>
              )}
            </div>
            {note && (
              <blockquote className="submitter-panel__note">
                {note}
                {submitterName && (
                  <cite className="submitter-panel__attribution">— {submitterName}</cite>
                )}
              </blockquote>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default SubmitterPanel
