'use client'

import type { FieldClientComponent } from 'payload'

import {
  Banner,
  ErrorIcon,
  InfoIcon,
  SuccessIcon,
  useDocumentInfo,
  useField,
  useFormFields,
} from '@payloadcms/ui'
import React from 'react'

import {
  OPEN_REVIEW_STATUSES,
  STATUS_LABELS,
  VERDICT_LABELS,
} from '@/collections/UserSubmissions/statuses'
import type { SubmissionScreeningResult, UserSubmission } from '@/payload-types'

import './styles.css'

type SubmissionStatus = UserSubmission['status']
type SubmissionType = UserSubmission['type']

/**
 * How loudly a status is drawn. There is deliberately no `warning`: the one
 * state that used it — a submission awaiting a decision — is the collection's
 * normal inbox, not a problem, and amber beside red Spam made routine work
 * look like a fault.
 */
type Severity = 'info' | 'error' | 'success'

const SEVERITY: Record<SubmissionStatus, Severity> = {
  pending: 'info',
  accepted: 'success',
  // Red like spam: both are refusals, and a reviewer scanning the list should
  // read "this was turned down" at the same glance either way.
  rejected: 'error',
  spam: 'error',
  failed: 'error',
}

/**
 * What a status means for each intake, beside the screening line. The
 * **heading** is not here — it is `STATUS_LABELS`, shared with the list column,
 * so a row and the banner it opens onto can't call the same state two names.
 *
 * Written for a manager who runs meditation classes, not for whoever built
 * this: no internal vocabulary, nothing that restates the heading. `spam` has
 * no line of its own — screening's note is the reason, and a fixed line beside
 * it said the same thing twice.
 *
 * ⚠ **`failed` means two different things.** For the three delivered intakes
 * the delivery itself failed, after its retries. For a proposal the decision
 * path is fine and only the reviewer email did not send, so it is still open.
 */
const COPY: Record<SubmissionType, Partial<Record<SubmissionStatus, string>>> = {
  contact: {
    pending: 'Waiting to be delivered to the form’s recipient.',
    accepted: 'Delivered to the form’s recipient.',
    failed: 'Could not be delivered. The activity log has the error.',
  },
  subscribe: {
    pending: 'Waiting to be added to the mailing list.',
    accepted: 'Added to the mailing list.',
    failed: 'Could not be added to the mailing list. The activity log has the error.',
  },
  registration: {
    pending: 'Waiting for the confirmation to be sent.',
    accepted: 'Registered for this event.',
    failed: 'The confirmation could not be sent. The activity log has the error.',
  },
  proposal: {
    pending: 'Compare the proposed changes with the preview, then accept or reject.',
    accepted:
      'This event is on the map, but the public sees it marked unverified. Give it a manager to have it verified.',
    rejected: 'Nothing was created or changed.',
    failed: 'The review email could not be sent. Accept or reject it here.',
  },
}

/**
 * A manager was assigned, so the event was adopted as it was created and is
 * already verified — the default accepted line would tell the reviewer to go
 * and do something they have just done.
 */
const CREATED_WITH_MANAGER =
  'This event is on the map and verified, looked after by the manager you assigned.'

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
function notesOf(result: SubmissionScreeningResult | null | undefined): string[] {
  const notes = result?.notes
  return Array.isArray(notes)
    ? notes.filter((note): note is string => typeof note === 'string')
    : []
}

/** What screening concluded, in one line — or that it has not run. */
function screeningLine(
  result: SubmissionScreeningResult | null | undefined,
  status: SubmissionStatus,
): string {
  const verdict = result?.verdict
  if (verdict && verdict in VERDICT_LABELS) {
    return verdict === 'ok'
      ? 'Passed screening.'
      : `Refused by screening: ${VERDICT_LABELS[verdict]}.`
  }
  // Pending with no verdict is the queue not having reached it. Anything else
  // with none was settled before screening existed — an imported row.
  return status === 'pending' ? 'Waiting to be screened.' : 'Not screened.'
}

/**
 * The submission's status, atop every submission: the state it is in, what
 * screening found, and what follows. **The one place status shows in the edit
 * view** — the `status` field renders nothing there, so the two can never be
 * read side by side and disagree.
 *
 * Screening's notes are rendered verbatim: screening composes them as complete
 * sentences, because it is the party that knows *why* it decided. They show
 * while a decision is still open, and on spam, where the note is the reason.
 * Once a proposal is decided they are spent advice about fields the page no
 * longer shows.
 *
 * Mounted on `screeningResult` — the data it renders — so it reads its own
 * value through `useField`, and `status` from form state.
 */
export const SubmissionStatus: FieldClientComponent = () => {
  const { id } = useDocumentInfo()
  const status = useFormFields(([fields]) => fields?.status?.value as SubmissionStatus | undefined)
  const type = useFormFields(([fields]) => fields?.type?.value as SubmissionType | undefined)
  const hasManager = useFormFields(([fields]) => Boolean(fields?.manager?.value))
  const { value } = useField<SubmissionScreeningResult | null>()

  if (!id || !status || !type || !(status in SEVERITY)) return null

  const severity = SEVERITY[status]
  const Icon = ICONS[severity]
  const message =
    type === 'proposal' && status === 'accepted' && hasManager
      ? CREATED_WITH_MANAGER
      : COPY[type]?.[status]
  const notes = OPEN_REVIEW_STATUSES.includes(status) || status === 'spam' ? notesOf(value) : []

  return (
    <div className="field-type json read-only">
      <Banner
        className={`event-submission-status event-submission-status--${severity}`}
        type={BANNER_TYPE[severity]}
        icon={<Icon />}
        alignIcon="left"
      >
        <div>
          <strong className="event-submission-status__title">{STATUS_LABELS[status]}</strong>
          <div>{screeningLine(value, status)}</div>
          {notes.length > 0 && (
            <ul className="event-submission-status__notes">
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          {message && <div>{message}</div>}
        </div>
      </Banner>
    </div>
  )
}

export default SubmissionStatus
