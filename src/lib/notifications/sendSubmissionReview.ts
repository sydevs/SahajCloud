import type { Payload } from 'payload'

import { createElement } from 'react'

import type { SubmissionReviewDetail } from '@/emails/EventSubmissionReviewEmail'
import { EventSubmissionReviewEmail } from '@/emails/EventSubmissionReviewEmail'
import { CONTACT_EMAIL } from '@/lib/contact'
import { getEmailBrand, renderEmail } from '@/plugins/email'

/**
 * Send the "please review this event submission" email. Throws on transport
 * failure — the screening job treats an undelivered notification as an
 * incomplete run (the submission stays `screening` and the queue retries),
 * mirroring the reminder ladder's block-until-delivered stance.
 */
export async function sendSubmissionReview(args: {
  payload: Payload
  to: string
  recipientName?: string | null
  kind: 'new-event' | 'event-update'
  eventTitle?: string | null
  submitterName: string
  submitterNote?: string | null
  details: SubmissionReviewDetail[]
  acceptUrl: string
  rejectUrl: string
}): Promise<void> {
  const { payload, to, ...props } = args
  const brand = getEmailBrand('sahaj-atlas')

  await payload.sendEmail({
    to,
    from: `${brand.productName} <${CONTACT_EMAIL}>`,
    subject:
      props.kind === 'new-event'
        ? 'New event submission to review'
        : `Proposed changes to “${props.eventTitle ?? 'an event'}”`,
    html: await renderEmail(createElement(EventSubmissionReviewEmail, { brand, ...props })),
  })
}
