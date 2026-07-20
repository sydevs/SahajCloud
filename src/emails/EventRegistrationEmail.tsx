import type { CSSProperties } from 'react'

import { Fragment } from 'react'
import { Heading, Hr, Link, Section, Text } from 'react-email'

import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand } from '@/plugins/email'

import { BrandButton, DetailRow, EmailLayout, styles } from './EmailLayout'

/** A registrant's answer to one registration question, labelled for display. */
export interface RegistrationAnswer {
  label: string
  value: string
}

interface EventRegistrationEmailProps {
  /** Recipient display name (the manager); `null`/omitted for a bare override address. */
  recipientName?: string | null
  /** The event's title. */
  eventTitle: string
  /** Registrant's name. */
  registrantName: string
  /** Registrant's email — the Reply CTA + a mailto row both point at it. */
  registrantEmail: string
  /** Formatted start date of the session the registrant chose, when one was supplied. */
  startDate?: string | null
  /** The registrant's answers to the event's registration questions. */
  answers?: RegistrationAnswer[]
  /** Absolute link to the event in the admin. */
  eventAdminUrl: string
  /** Project to brand for. Defaults to `sahaj-atlas` (events are Atlas). */
  project?: ProjectSlug
}

/**
 * Manager-facing notification that a seeker registered for an event.
 *
 * Informational, not an alert — no callout or deadline. Reuses the shared
 * EmailLayout shell, DetailRow fact table, and BrandButton, branded for the
 * Sahaj Atlas project (this is an internal manager notice, not registrant mail,
 * so it is not client-branded). The primary action replies to the registrant;
 * their answers to the event's registration questions are forwarded below.
 */
export function EventRegistrationEmail({
  recipientName,
  eventTitle,
  registrantName,
  registrantEmail,
  startDate,
  answers = [],
  eventAdminUrl,
  project = 'sahaj-atlas',
}: EventRegistrationEmailProps) {
  const brand = getEmailBrand(project)

  // Pre-fill a reply to the registrant so the manager can welcome them in one click.
  const replyHref = `mailto:${registrantEmail}?subject=${encodeURIComponent(
    `Your registration for ${eventTitle}`,
  )}&body=${encodeURIComponent(`Hello ${registrantName},\n\n`)}`

  return (
    <EmailLayout
      brand={brand}
      heading="New event registration"
      previewText={`${registrantName} registered for ${eventTitle}`}
    >
      <Text style={styles.paragraph}>
        Hello {recipientName ? <strong>{recipientName}</strong> : 'there'},
      </Text>
      <Text style={styles.paragraph}>
        A new registration has come in for <strong>{eventTitle}</strong>.
      </Text>

      <Section>
        <DetailRow label="Event">{eventTitle}</DetailRow>
        <DetailRow label="Registrant">{registrantName}</DetailRow>
        <DetailRow label="Email">
          <Link
            href={`mailto:${registrantEmail}`}
            style={{ ...styles.link, color: brand.colors.primary }}
          >
            {registrantEmail}
          </Link>
        </DetailRow>
        {startDate ? <DetailRow label="Start date">{startDate}</DetailRow> : null}
      </Section>

      {answers.length > 0 ? (
        <Section>
          <Heading as="h3" style={sectionHeading}>
            Registration answers
          </Heading>
          {answers.map((answer) => (
            <Fragment key={answer.label}>
              <Text style={answerQuestion}>{answer.label}</Text>
              <Text style={answerValue}>{answer.value}</Text>
            </Fragment>
          ))}
        </Section>
      ) : null}

      <BrandButton href={replyHref} brand={brand}>
        Reply to {registrantName}
      </BrandButton>
      <BrandButton href={eventAdminUrl} brand={brand} variant="secondary" tight>
        View event
      </BrandButton>

      <Hr style={styles.hr} />
      <Text style={styles.footer}>
        You’re receiving this because you manage this event on {brand.productName}.
      </Text>
    </EmailLayout>
  )
}

const sectionHeading: CSSProperties = {
  margin: '18px 0 10px',
  fontSize: '12px',
  fontWeight: 700,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}
const answerQuestion: CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#374151',
  margin: '0 0 2px',
}
const answerValue: CSSProperties = {
  fontSize: '14px',
  color: '#1f2937',
  margin: '0 0 12px',
  whiteSpace: 'pre-wrap',
}
