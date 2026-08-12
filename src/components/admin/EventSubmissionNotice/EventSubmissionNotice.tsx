'use client'

import {
  Banner,
  ErrorIcon,
  InfoIcon,
  SuccessIcon,
  useDocumentInfo,
  useFormFields,
  WarningIcon,
} from '@payloadcms/ui'
import React from 'react'

type SubmissionStatus = 'screening' | 'pending' | 'spam' | 'created' | 'updated' | 'rejected'

interface ScreeningResultShape {
  emailVerdict?: string
  region?: string
  warnings?: string[]
}

const COPY: Record<
  SubmissionStatus,
  { severity: 'info' | 'warning' | 'error' | 'success'; message: string }
> = {
  screening: {
    severity: 'info',
    message:
      'Screening in progress — the submitter’s email is being checked and the region resolved. The responsible manager is notified automatically once it passes (retried every 15 minutes).',
  },
  pending: {
    severity: 'warning',
    message:
      'Awaiting review. Check this isn’t spam and looks plausible, correct any fields, then Accept — a new event is published as an unverified listing (adoption stays a separate step); an update proposal is applied to its event. Reject shelves it.',
  },
  spam: {
    severity: 'error',
    message:
      'Classified as spam by screening (see the details below) and kept for abuse tracking. Nobody was notified.',
  },
  created: {
    severity: 'success',
    message:
      'Accepted — a new unverified event was created and published; the Event field above links to it. Assigning it a manager will adopt it into the verification cycle.',
  },
  updated: {
    severity: 'success',
    message: 'Accepted — the proposed changes were applied to the linked event.',
  },
  rejected: {
    severity: 'info',
    message: 'Rejected. Kept for record-keeping; no event was created or changed.',
  },
}

const ICONS = {
  info: InfoIcon,
  warning: WarningIcon,
  error: ErrorIcon,
  success: SuccessIcon,
} as const

const BANNER_TYPE = {
  info: 'default',
  warning: 'error',
  error: 'error',
  success: 'success',
} as const

/**
 * Status banner atop an Event Submission's edit view: what state the
 * submission is in, what Accept/Reject will do (the buttons replace the Save
 * button — see EventSubmissionSaveButton), and the screening verdict when one
 * was recorded.
 */
const EventSubmissionNotice: React.FC = () => {
  const { id } = useDocumentInfo()
  const status = useFormFields(([fields]) => fields?.status?.value as SubmissionStatus | undefined)
  const screeningResult = useFormFields(
    ([fields]) => fields?.screeningResult?.value as ScreeningResultShape | null | undefined,
  )

  if (!id || !status || !COPY[status]) return null

  const { severity, message } = COPY[status]
  const Icon = ICONS[severity]

  const screeningNotes: string[] = []
  if (status === 'spam' && screeningResult?.emailVerdict) {
    screeningNotes.push(`Email verdict: ${screeningResult.emailVerdict.replaceAll('_', ' ')}`)
  }
  if (screeningResult?.region === 'unresolved') {
    screeningNotes.push(
      'No city could be resolved — set an existing city/venue as the anchor region before accepting.',
    )
  }
  for (const warning of screeningResult?.warnings ?? []) screeningNotes.push(warning)

  return (
    <Banner type={BANNER_TYPE[severity]} icon={<Icon />} alignIcon="left">
      {message}
      {screeningNotes.length > 0 && (
        <ul style={{ margin: 'calc(var(--base) * 0.4) 0 0', paddingLeft: '1.2em' }}>
          {screeningNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </Banner>
  )
}

export default EventSubmissionNotice
