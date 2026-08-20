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
import {
  OPEN_SUBMISSION_STATUSES,
  type SubmissionStatus,
} from '@/collections/EventSubmissions/statuses'

import './styles.css'

/**
 * How loudly a status is drawn. There is deliberately no `warning`: the one
 * state that used it — a submission awaiting a decision — is the collection's
 * normal inbox, not a problem, and amber beside red Spam made routine work
 * look like a fault.
 */
type Severity = 'info' | 'error' | 'success'

/**
 * One line naming the state, one saying what to do about it.
 *
 * Written for a manager who runs meditation classes, not for whoever built
 * this. So: no internal vocabulary ("adopt into the verification cycle"), no
 * delivery bookkeeping (who got emailed), and nothing that restates the title.
 * `spam` deliberately carries no message of its own — the reason it was
 * classified that way is a screening note, and a fixed line beside it just
 * said the same thing twice.
 */
const COPY: Record<
  SubmissionStatus,
  { severity: Severity; title: string; message?: string }
> = {
  screening: {
    severity: 'info',
    title: 'Checking',
    message: 'Checking the submitter’s details. This usually takes a few minutes.',
  },
  pending: {
    severity: 'info',
    title: 'Awaiting Review',
    message: 'Compare the proposed changes with the preview, then accept or reject.',
  },
  spam: { severity: 'error', title: 'Marked Spam' },
  created: {
    severity: 'success',
    title: 'Event Created',
    message:
      'This event is on the map, but the public sees it marked unverified. Give it a manager to have it verified.',
  },
  updated: {
    severity: 'success',
    title: 'Event Updated',
    message: 'The proposed changes were applied to the event.',
  },
  rejected: {
    // Red like spam: both are refusals, and a reviewer scanning the list
    // should read "this was turned down" at the same glance either way.
    severity: 'error',
    title: 'Rejected',
    message: 'Nothing was created or changed.',
  },
}

/**
 * A manager was assigned, so the event was adopted as it was created and is
 * already verified — the default `created` line would tell the reviewer to go
 * and do something they have just done.
 */
const CREATED_WITH_MANAGER =
  'This event is on the map and verified, looked after by the manager you assigned.'

/** Said when a submission is spam but screening left no reason. */
const SPAM_FALLBACK = 'The submitter’s contact details could not be verified.'

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
 * consequence. Screening now writes only notes that ask something of the
 * reviewer, so most submissions show none at all.
 *
 * Mounted on `screeningResult` — the data it renders — rather than on a `ui`
 * field, so it reads its own value through `useField` instead of reaching
 * across form state for it.
 */
export const EventSubmissionStatus: FieldClientComponent = ({ field }) => {
  const { name, label } = field as JSONFieldClient
  const { id } = useDocumentInfo()
  const status = useFormFields(([fields]) => fields?.status?.value as SubmissionStatus | undefined)
  const hasManager = useFormFields(([fields]) => Boolean(fields?.manager?.value))
  const { value } = useField<ScreeningResult | null>()

  if (!id || !status || !COPY[status]) return null

  const { severity, title } = COPY[status]
  const Icon = ICONS[severity]
  const message =
    status === 'created' && hasManager ? CREATED_WITH_MANAGER : COPY[status].message
  // Screening's notes tell the reviewer what to settle *before* deciding
  // ("check the Region below looks right"). Once the decision is made they are
  // spent advice about a field the page no longer even shows — an accepted
  // submission hides Region, because the event owns it now. Spam is the
  // exception: its note is the reason, which is the whole point of the banner.
  const notes = OPEN_SUBMISSION_STATUSES.includes(status) || status === 'spam'
    ? notesOf(value)
    : []

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
          {message && <div>{message}</div>}
          {/* Spam has no fixed message — the screening note *is* the reason,
              and it must not be left saying nothing if screening wrote none. */}
          {!message && notes.length === 0 && status === 'spam' && <div>{SPAM_FALLBACK}</div>}
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
