'use client'

import type { FieldClientComponent, JSONFieldClient } from 'payload'

import { Banner, FieldLabel, useField } from '@payloadcms/ui'
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
 * Built on Payload's `Banner` rather than hand-rolled markup, so the card's
 * padding and radius come from the admin theme. `Card` would be the obvious
 * alternative and doesn't fit — it takes a `title` string and no children, so
 * there is nowhere to put the note.
 *
 * Its background is Banner's own default, which reads from
 * `--theme-elevation-*` — so it picks up the project's theme tint rather than
 * being pinned to a fixed grey.
 *
 * The identity goes in the banner's first line and the note below it, labelled
 * "Message:" and **in quotation marks**, because it is a stranger's own words:
 * a reviewer weighing whether a submission is plausible needs to see which
 * text is theirs and which is ours.
 *
 * The heading is Payload's own `FieldLabel`, fed straight from the field's
 * `label` in the collection — a custom `Field` component replaces the whole
 * field render, label included, so Payload draws no title of its own and this
 * is what "the built-in field title" means here. No fallback string: the
 * collection is the only place the wording lives.
 *
 * The resolved `submitter` user record is a relationship in the System drawer;
 * this shows the raw strings as typed, which is what matters when deciding
 * whether a submission is genuine.
 */
export const EventSubmissionSubmitter: FieldClientComponent = ({ field }) => {
  const { name, label } = field as JSONFieldClient
  const { value } = useField<SubmitterInfo | null>()
  const info = (value ?? {}) as SubmitterInfo

  const submitterName = text(info.name)
  const email = text(info.email)
  const note = text(info.note)

  return (
    <div className="field-type json read-only">
      <FieldLabel label={label} path={name} />
      <div className="field-type__wrap">
        {!submitterName && !email && !note ? (
          <div className="event-submission-submitter__empty">No submitter details were recorded.</div>
        ) : (
          <Banner alignIcon="left">
            <div className="event-submission-submitter__identity">
              {submitterName && <span className="event-submission-submitter__name">{submitterName}</span>}
              {email && (
                <a className="event-submission-submitter__email" href={`mailto:${email}`}>
                  {email}
                </a>
              )}
            </div>
            {note && (
              <div className="event-submission-submitter__note">
                <span className="event-submission-submitter__note-label">Message:</span>{' '}
                <q>{note}</q>
              </div>
            )}
          </Banner>
        )}
      </div>
    </div>
  )
}

export default EventSubmissionSubmitter
