'use client'

import type { FieldClientComponent, JSONFieldClient } from 'payload'

import {
  Banner,
  ErrorIcon,
  FieldLabel,
  InfoIcon,
  SuccessIcon,
  useDocumentInfo,
  useField,
  useFormFields,
} from '@payloadcms/ui'
import React from 'react'

import type { ScreeningResult } from '@/collections/EventSubmissions/screening'
import type { SubmissionStatus } from '@/collections/EventSubmissions/statuses'

import './styles.css'

/**
 * How loudly a status is drawn. There is deliberately no `warning`: the one
 * state that used it — a submission awaiting a decision — is the collection's
 * normal inbox, not a problem, and amber beside red Spam made routine work
 * look like a fault.
 */
type Severity = 'info' | 'error' | 'success'

/**
 * One line naming the state, one saying what follows from it.
 *
 * The body deliberately doesn't restate what the title already says, name the
 * buttons (they are right there), or repeat a field's own description — the
 * region hint and the Event link each explain themselves where they sit.
 */
const COPY: Record<SubmissionStatus, { severity: Severity; title: string; message: string }> = {
  screening: {
    severity: 'info',
    title: 'Screening',
    message:
      'Checking the submitter’s email and resolving the region. Retries every 15 minutes.',
  },
  pending: {
    severity: 'info',
    title: 'Awaiting Review',
    message: 'Compare the proposed changes with the preview, then accept or reject.',
  },
  spam: {
    severity: 'error',
    title: 'Marked Spam',
    message: 'Kept for abuse tracking. Nobody was notified.',
  },
  created: {
    severity: 'success',
    title: 'Event Created',
    message: 'Published as unverified — assign a manager to adopt it into the verification cycle.',
  },
  updated: {
    severity: 'success',
    title: 'Event Updated',
    message: 'The proposed changes were applied.',
  },
  rejected: {
    // Red like spam: both are refusals, and a reviewer scanning the list
    // should read "this was turned down" at the same glance either way.
    severity: 'error',
    title: 'Rejected',
    message: 'Kept for the record. Nothing was created or changed.',
  },
}

const ICONS: Record<Severity, React.FC> = {
  info: InfoIcon,
  error: ErrorIcon,
  success: SuccessIcon,
}

/**
 * Banner's own `type` — the built-in property, used as-is now that every
 * severity maps onto a variant it actually ships.
 */
const BANNER_TYPE: Record<Severity, 'default' | 'error' | 'success'> = {
  info: 'default',
  error: 'error',
  success: 'success',
}

/**
 * The stored value is JSON, so it can be anything a bad write left behind —
 * render only real strings rather than trusting the column's declared type.
 * A malformed row degrades to no notes instead of throwing the edit view.
 */
function notesOf(result: ScreeningResult | null | undefined): string[] {
  const notes = result?.notes
  return Array.isArray(notes) ? notes.filter((note): note is string => typeof note === 'string') : []
}

/**
 * Status banner atop an Event Submission: what state it's in, what follows
 * from it, and whatever screening found.
 *
 * The notes are rendered verbatim — screening composes them as complete
 * sentences, because it is the party that knows *why* it decided what it did.
 * This component used to assemble one from an enum (`Email verdict: disposable
 * email`), which read like a debug dump and left the reviewer to infer the
 * consequence.
 *
 * Mounted on `screeningResult` — the data it renders — rather than on a `ui`
 * field, so it reads its own value through `useField` instead of reaching
 * across form state for it.
 */
export const EventSubmissionStatus: FieldClientComponent = ({ field }) => {
  const { name, label } = field as JSONFieldClient
  const { id } = useDocumentInfo()
  const status = useFormFields(([fields]) => fields?.status?.value as SubmissionStatus | undefined)
  const { value } = useField<ScreeningResult | null>()

  if (!id || !status || !COPY[status]) return null

  const { severity, title, message } = COPY[status]
  const Icon = ICONS[severity]
  const notes = notesOf(value)

  return (
    <div className="field-type json read-only">
      <FieldLabel label={label} path={name} />
      <Banner
        className={`event-submission-status event-submission-status--${severity}`}
        type={BANNER_TYPE[severity]}
        icon={<Icon />}
        alignIcon="left"
      >
        <div>
          <strong className="event-submission-status__title">{title}</strong>
          <div>{message}</div>
          {notes.length > 0 && (
            <ul className="event-submission-status__notes">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      </Banner>
    </div>
  )
}

export default EventSubmissionStatus
