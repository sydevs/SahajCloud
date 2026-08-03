import type { CSSProperties } from 'react'

import { Hr, Link, Section, Text } from 'react-email'

import type { ContactAdminContext } from '@/endpoints/responseTypes'
import type { EmailBrand } from '@/plugins/email'

import { DetailRow, EmailLayout, SectionHeading, styles } from './EmailLayout'

/** One label/value row in the details block. */
export interface ContactAdminDetail {
  label: string
  value: string
}

/**
 * Assemble the details block from the caller-supplied context.
 *
 * Deliberately generic: the endpoint is shared by every client app, so a caller
 * sending only `{ message, turnstileToken }` must not produce a table of empty
 * rows. A row appears only when its value is a non-blank string — which is also
 * why this is a pure function rather than inline JSX conditionals: the omission
 * rule is the contract, and it's unit-tested.
 */
export function buildContactDetails(args: {
  /** Name of the API client service the message came through. */
  clientName: string
  /** When the message was received (ISO 8601). */
  receivedAt: string
  context?: ContactAdminContext
}): ContactAdminDetail[] {
  const { clientName, receivedAt, context } = args

  const rows: [string, string | undefined][] = [
    ['Service', clientName],
    ['Locale', context?.locale],
    ['Path', context?.path],
    ['Host page', context?.hostUrl],
    ['Error', context?.error],
    ['User agent', context?.userAgent],
    ['Received', receivedAt],
  ]

  return rows
    .filter((row): row is [string, string] => typeof row[1] === 'string' && row[1].trim() !== '')
    .map(([label, value]) => ({ label, value }))
}

interface ContactAdminEmailProps {
  /** The sender's message, verbatim. Rendered pre-wrapped, so line breaks survive. */
  message: string
  /** The sender's address, when they supplied one. Also the message's `Reply-To`. */
  senderEmail?: string | null
  /** The caller's label for this channel, e.g. `"Issue report"`. */
  subject: string
  /** Pre-filtered label/value rows — see {@link buildContactDetails}. */
  details: ContactAdminDetail[]
  /**
   * Resolved brand, passed in rather than looked up here (the
   * `SessionReminderEmail` / `RegistrationDigestEmail` shape). The sender also
   * needs it for the `From` display name, so resolving it once at the send site
   * keeps the header and the body from ever disagreeing.
   */
  brand: EmailBrand
}

/**
 * Admin-facing message sent on a viewer's behalf via `POST /api/contact-admin`.
 *
 * Informational, not an alert — the same shape as `EventRegistrationEmail`: no
 * callout or deadline, a `DetailRow` fact table, and the shared `EmailLayout`
 * shell. Deliberately free of any per-caller framing (no "report an issue"
 * wording): the caller supplies its own `subject` and context, so WeMeditateWeb
 * can reuse the template unchanged.
 *
 * There is no CTA button — replying to the email *is* the action, and the
 * message's `Reply-To` is already the sender's address.
 */
export function ContactAdminEmail({
  message,
  senderEmail,
  subject,
  details,
  brand,
}: ContactAdminEmailProps) {
  return (
    <EmailLayout brand={brand} heading={subject} previewText={message.slice(0, 120)}>
      <Text style={styles.paragraph}>
        {senderEmail ? (
          <>
            A message came in from{' '}
            <Link
              href={`mailto:${senderEmail}`}
              style={{ ...styles.link, color: brand.colors.primary }}
            >
              {senderEmail}
            </Link>
            . Reply to this email to answer them directly.
          </>
        ) : (
          'A message came in. The sender left no address, so there is no way to reply.'
        )}
      </Text>

      <Section>
        <SectionHeading>Message</SectionHeading>
        <Text style={messageBody}>{message}</Text>
      </Section>

      {details.length > 0 ? (
        <Section>
          <SectionHeading>Details</SectionHeading>
          {details.map((detail) => (
            <DetailRow key={detail.label} label={detail.label}>
              {detail.value}
            </DetailRow>
          ))}
        </Section>
      ) : null}

      <Hr style={styles.hr} />
      <Text style={styles.footer}>
        Sent via {brand.productName} — nothing about this message is stored; this email is the only
        record.
      </Text>
    </EmailLayout>
  )
}

const messageBody: CSSProperties = {
  fontSize: '15px',
  color: '#1f2937',
  margin: '0 0 12px',
  whiteSpace: 'pre-wrap',
}
