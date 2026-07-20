import { Hr, Link, Section, Text } from 'react-email'

import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand } from '@/plugins/email'

import { BrandButton, DetailRow, EmailLayout, styles } from './EmailLayout'

interface EventRegistrationEmailProps {
  /** Recipient display name (the manager); `null`/omitted for a bare override address. */
  recipientName?: string | null
  /** The event's title. */
  eventTitle: string
  /** Registrant's name. */
  registrantName: string
  /** Registrant's email — rendered as a mailto so the manager can reply directly. */
  registrantEmail: string
  /** Formatted session date the registrant chose, when one was supplied. */
  sessionDate?: string | null
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
 * so it is not client-branded).
 */
export function EventRegistrationEmail({
  recipientName,
  eventTitle,
  registrantName,
  registrantEmail,
  sessionDate,
  eventAdminUrl,
  project = 'sahaj-atlas',
}: EventRegistrationEmailProps) {
  const brand = getEmailBrand(project)

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
        {sessionDate ? <DetailRow label="Session">{sessionDate}</DetailRow> : null}
      </Section>

      <BrandButton href={eventAdminUrl} brand={brand}>
        View event
      </BrandButton>

      <Hr style={styles.hr} />
      <Text style={styles.footer}>
        You’re receiving this because you manage this event on {brand.productName}.
      </Text>
    </EmailLayout>
  )
}
