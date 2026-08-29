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

import { STATUS_LABELS, type MessageStatus } from '@/collections/UserMessages/statuses'
import type { UserMessage } from '@/payload-types'

import './styles.css'

/** The banner variant each status is drawn as — `Banner`'s own type, not a private alias for it. */
type BannerType = 'default' | 'error' | 'success'

/**
 * How loudly to draw each status, and what to do about it. The **heading** is
 * not here — it is `STATUS_LABELS`, shared with the list column and the `status`
 * select, so a row and the banner it opens onto can't call the same state two
 * different things.
 *
 * `spam` deliberately carries no message of its own: the reason it was
 * classified that way is a screening note, and a fixed line beside it would say
 * the same thing twice.
 */
const COPY: Record<MessageStatus, { type: BannerType; message?: string }> = {
  screening: {
    type: 'default',
    message: 'Checking the sender’s details. This usually takes a few minutes.',
  },
  delivered: {
    type: 'success',
    message:
      'This was emailed to the contact address. Reply there — replies go straight to the sender.',
  },
  spam: { type: 'error' },
  failed: {
    type: 'error',
    message:
      'The message passed the checks but could not be emailed out. It is being retried; if it stays here, reply to the sender directly.',
  },
}

/** Said when a message is spam but screening left no reason. */
const SPAM_FALLBACK = 'The sender’s contact details could not be verified.'

const ICONS: Record<BannerType, React.FC> = {
  default: InfoIcon,
  error: ErrorIcon,
  success: SuccessIcon,
}

/**
 * Status banner atop a User Message: what state it's in, what follows from it,
 * and whatever screening found.
 *
 * The notes are rendered verbatim — screening composes them as complete
 * sentences, because it is the party that knows *why* it decided what it did.
 * Mounted on `screeningResult` (the data it renders) rather than on a `ui`
 * field, so it reads its own value through `useField` instead of reaching
 * across form state for it. Same shape as `EventSubmissionStatus`.
 */
export const UserMessageStatus: FieldClientComponent = ({ field }) => {
  const { name, label } = field as JSONFieldClient
  const { id } = useDocumentInfo()
  const status = useFormFields(([fields]) => fields?.status?.value as MessageStatus | undefined)
  const { value } = useField<UserMessage['screeningResult']>()

  if (!id || !status || !COPY[status]) return null

  const { type, message } = COPY[status]
  const Icon = ICONS[type]
  // The column's `jsonSchema` types `notes` and refuses anything else on write,
  // so there is nothing left to filter out here.
  const notes = value?.notes ?? []

  return (
    <div className="field-type json read-only">
      <FieldLabel label={label} path={name} />
      <Banner className="user-message-status" type={type} icon={<Icon />} alignIcon="left">
        <div>
          <strong className="user-message-status__title">{STATUS_LABELS[status]}</strong>
          {message && <div>{message}</div>}
          {/* Spam has no fixed message — the screening note *is* the reason, and
              it must not be left saying nothing if screening wrote none. */}
          {!message && notes.length === 0 && status === 'spam' && <div>{SPAM_FALLBACK}</div>}
          {notes.length > 0 && (
            <ul className="user-message-status__notes">
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

export default UserMessageStatus
