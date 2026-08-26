/**
 * Send an admin-facing user message on a viewer's behalf (`user-messages`, #632).
 *
 * **Throws on failure, deliberately.** Under #602 the reason was that nothing
 * was persisted, so the email was the entire deliverable and the endpoint owed
 * the caller a 502. The message is now stored, and the caller is long gone by
 * the time this runs — but the throw still matters, because the *job* is now the
 * party that reacts to it: `screenUserMessage` catches it, records the row as
 * `failed` so an admin can see it, and rethrows to earn a retry. Swallowing here
 * would turn a failed send into a silently "delivered" message.
 *
 * Same "policy stays at the call site" split as the registration notifications.
 */

import type { Payload } from 'payload'

import { createElement } from 'react'

import type { UserMessageContext } from '@/collections/UserMessages/types'
import { buildUserMessageDetails, UserMessageEmail } from '@/emails/UserMessageEmail'
import { CONTACT_EMAIL } from '@/lib/contact'
import { headerDisplayName, stripNewlines } from '@/lib/utilities/emailSafeText'
import { getEmailBrand, renderEmail } from '@/plugins/email'

export interface SendUserMessageArgs {
  payload: Payload
  /** Name of the API client service the message came through — the subject prefix. */
  clientName: string
  /** The sender's message, verbatim. */
  message: string
  /** The caller's label for this channel, e.g. `"Issue report"`. */
  subject: string
  /** The sender's address; becomes `Reply-To` when present. */
  senderEmail?: string
  /** Caller-supplied context rendered into the details block. */
  context?: UserMessageContext
  /** When the message was received (ISO 8601). */
  receivedAt: string
}

export async function sendUserMessage(args: SendUserMessageArgs): Promise<void> {
  const { payload, clientName, message, subject, senderEmail, context, receivedAt } = args

  const brand = getEmailBrand()

  await payload.sendEmail({
    to: CONTACT_EMAIL,
    // `From` stays CONTACT_EMAIL — Resend verifies senders per domain, so we
    // can't send as the viewer. Their address rides on `Reply-To` instead, which
    // is what makes replying to this email answer them directly.
    from: `${headerDisplayName(brand.productName)} <${CONTACT_EMAIL}>`,
    // Omit `replyTo` entirely when the sender left no address — an empty string
    // would be an invalid header, and Resend 422s on one.
    ...(senderEmail ? { replyTo: senderEmail } : {}),
    // Both halves are untrusted single-line text: the client name is
    // manager-authored, the subject is caller-supplied. Strip line breaks so
    // neither can start a second header.
    subject: stripNewlines(`[${clientName}] ${subject}`),
    html: await renderEmail(
      createElement(UserMessageEmail, {
        message,
        senderEmail,
        subject,
        brand,
        details: buildUserMessageDetails({ clientName, receivedAt, context }),
      }),
    ),
  })
}
