/**
 * Send an admin-facing contact message on a viewer's behalf (`POST /api/contact-admin`).
 *
 * Unlike the registration sends, this one is **not** best-effort: nothing is
 * persisted, so the email is the entire deliverable. A failure must reach the
 * caller (the endpoint answers 502), which is why this throws rather than
 * swallowing — the same "policy stays at the call site" split the registration
 * notification uses.
 */

import type { Payload } from 'payload'

import { createElement } from 'react'

import { buildContactDetails, ContactAdminEmail } from '@/emails/ContactAdminEmail'
import type { ContactAdminContext } from '@/endpoints/responseTypes'
import { CONTACT_EMAIL } from '@/lib/contact'
import { headerDisplayName, stripNewlines } from '@/lib/utilities/emailSafeText'
import { getEmailBrand, renderEmail } from '@/plugins/email'

export interface SendContactAdminArgs {
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
  context?: ContactAdminContext
  /** When the message was received (ISO 8601). */
  receivedAt: string
}

export async function sendContactAdmin(args: SendContactAdminArgs): Promise<void> {
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
      createElement(ContactAdminEmail, {
        message,
        senderEmail,
        subject,
        details: buildContactDetails({ clientName, receivedAt, context }),
      }),
    ),
  })
}
