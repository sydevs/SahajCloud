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
  WarningIcon,
} from '@payloadcms/ui'
import React from 'react'

import './styles.css'

type SubmissionStatus = 'screening' | 'pending' | 'spam' | 'created' | 'updated' | 'rejected'

/** What the screening job recorded. Shape owned by `ScreenEventSubmissions`. */
interface ScreeningResultShape {
  emailVerdict?: unknown
  region?: unknown
  warnings?: unknown
}

type Severity = 'info' | 'warning' | 'error' | 'success'

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
    severity: 'warning',
    title: 'Needs Review',
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
    severity: 'info',
    title: 'Rejected',
    message: 'Kept for the record. Nothing was created or changed.',
  },
}

const ICONS: Record<Severity, React.FC> = {
  info: InfoIcon,
  warning: WarningIcon,
  error: ErrorIcon,
  success: SuccessIcon,
}

/**
 * Banner's own `type` — the built-in property, used wherever it has a variant.
 *
 * It ships `default | error | success` only. `warning` maps to `default` here
 * and gets its colour from `.event-submission-notice--warning` instead
 * (Payload's own `--theme-warning-*` ramp): mapping it to `error` is what
 * previously repainted the amber WarningIcon red — `.banner--type-error`
 * applies `color-svg(var(--theme-error-600))` to every nested svg — making a
 * "needs a look" notice look like a failure.
 */
const BANNER_TYPE: Record<Severity, 'default' | 'error' | 'success'> = {
  info: 'default',
  warning: 'default',
  error: 'error',
  success: 'success',
}

/** Screening notes are free text from the job; render only real strings. */
function stringsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

/**
 * Status banner atop an Event Submission: what state it's in, what Accept /
 * Reject will do, and the screening verdict when one was recorded.
 *
 * Mounted on `screeningResult` — the data it renders — rather than on a `ui`
 * field, so it reads its own value through `useField` instead of reaching
 * across form state for it.
 */
export const EventSubmissionNotice: FieldClientComponent = ({ field }) => {
  const { name, label } = field as JSONFieldClient
  const { id } = useDocumentInfo()
  const status = useFormFields(([fields]) => fields?.status?.value as SubmissionStatus | undefined)
  const { value } = useField<ScreeningResultShape | null>()

  if (!id || !status || !COPY[status]) return null

  const { severity, title, message } = COPY[status]
  const Icon = ICONS[severity]
  const screening = (value ?? {}) as ScreeningResultShape

  const notes: string[] = []
  // `emailVerdict` is a string enum (`ok` / `disposable_email` / …) — guard the
  // type rather than assuming it, so a malformed row degrades to no note
  // instead of throwing the whole edit view.
  if (status === 'spam' && typeof screening.emailVerdict === 'string') {
    notes.push(`Email verdict: ${screening.emailVerdict.replaceAll('_', ' ')}`)
  }
  if (screening.region === 'unresolved') {
    notes.push('No city could be resolved — set the Region field before accepting.')
  }
  notes.push(...stringsOf(screening.warnings))

  return (
    <div className="field-type json read-only">
      <FieldLabel label={label} path={name} />
      <Banner
        className={`event-submission-notice event-submission-notice--${severity}`}
        type={BANNER_TYPE[severity]}
        icon={<Icon />}
        alignIcon="left"
      >
        <div>
          <strong className="event-submission-notice__title">{title}</strong>
          <div>{message}</div>
          {notes.length > 0 && (
            <ul style={{ margin: 'calc(var(--base) * 0.4) 0 0', paddingLeft: '1.2em' }}>
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

export default EventSubmissionNotice
