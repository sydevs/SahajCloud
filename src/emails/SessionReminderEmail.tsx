import type { CSSProperties } from 'react'

import { Heading, Hr, Link, Section, Text } from 'react-email'

import type { RegistrationEmailDetails } from '@/lib/notifications/registrationDetails'
import { type EmailStrings, interpolate } from '@/lib/translations/emailStrings'
import type { EmailBrand } from '@/plugins/email'

import { BrandButton, EmailLayout, StackedDetailRow, styles } from './EmailLayout'

export interface SessionReminderEmailProps {
  /** Registrant's display name. */
  name: string
  /** Branding for the client service the registration came through. */
  brand: EmailBrand
  /** Localized chrome, pre-resolved — a template never queries. */
  strings: EmailStrings
  /** Event facts for the single upcoming occurrence (via `buildReminderEmailDetails`). */
  details: RegistrationEmailDetails
  /** Signed unsubscribe link for this registration. */
  unsubscribeUrl: string
}

/**
 * Registrant-facing reminder, sent ~24h before a session.
 *
 * A sibling of `RegistrationConfirmationEmail` — same guest-itinerary shape and
 * the same shared primitives (`EmailLayout`, `StackedDetailRow`, `BrandButton`)
 * — differing only in intent: it states the *single next* occurrence (not the
 * series), carries no ICS (the confirmation already delivered the calendar), and
 * ends with an unsubscribe link that stops further reminders for this
 * registration.
 */
export function SessionReminderEmail({
  name,
  brand,
  strings,
  details,
  unsubscribeUrl,
}: SessionReminderEmailProps) {
  const { location } = details

  return (
    <EmailLayout
      brand={brand}
      heading={strings.reminder_heading}
      previewText={interpolate(strings.reminder_subject, { event: details.eventTitle })}
    >
      <Text style={styles.paragraph}>{interpolate(strings.reminder_intro, { name })}</Text>

      <Section style={detailBlock}>
        <Heading as="h3" style={eventTitle}>
          {details.eventTitle}
        </Heading>

        <StackedDetailRow label={strings.when_label} accent={brand.colors.primary}>
          {details.scheduleLine}
        </StackedDetailRow>

        {location.type === 'offline' ? (
          <StackedDetailRow label={strings.where_label} accent={brand.colors.primary}>
            {location.address}
          </StackedDetailRow>
        ) : null}

        {details.contact ? (
          <StackedDetailRow label={strings.contact_label} accent={brand.colors.primary}>
            {details.contact}
          </StackedDetailRow>
        ) : null}
      </Section>

      {/* Online events repeat the join URL as selectable plain text in case a
          client strips the button; offline events link to a map instead. */}
      {location.type === 'online' ? (
        <>
          <BrandButton href={location.joinUrl} brand={brand}>
            {strings.online_cta}
          </BrandButton>
          <Text style={styles.hint}>
            {strings.online_link_hint}
            <br />
            <Link href={location.joinUrl} style={{ ...styles.link, color: brand.colors.primary }}>
              {location.joinUrl}
            </Link>
          </Text>
        </>
      ) : null}

      {location.type === 'offline' && location.mapsUrl ? (
        <BrandButton href={location.mapsUrl} brand={brand}>
          {strings.directions_cta}
        </BrandButton>
      ) : null}

      <Hr style={styles.hr} />

      <Text style={styles.footer}>
        {strings.reminder_footer_reason}
        <br />
        <Link href={unsubscribeUrl} style={{ color: brand.colors.primary }}>
          {strings.unsubscribe_cta}
        </Link>
      </Text>
    </EmailLayout>
  )
}

/**
 * Plain-text alternative. Kept beside the component so the two can't drift, and
 * sent alongside the HTML — a text part improves deliverability and is what a
 * text-only client shows.
 */
export function sessionReminderText(props: SessionReminderEmailProps): string {
  const { name, strings, details, unsubscribeUrl } = props
  const { location } = details

  const lines: string[] = [
    strings.reminder_heading,
    '',
    interpolate(strings.reminder_intro, { name }),
    '',
    details.eventTitle,
    '',
    `${strings.when_label}: ${details.scheduleLine}`,
  ]

  if (location.type === 'online') {
    lines.push(`${strings.where_label}: ${location.joinUrl}`)
  } else if (location.type === 'offline') {
    lines.push(`${strings.where_label}: ${location.address}`)
    if (location.mapsUrl) lines.push(`${strings.directions_cta}: ${location.mapsUrl}`)
  }

  if (details.contact) lines.push(`${strings.contact_label}: ${details.contact}`)

  lines.push(
    '',
    '—',
    strings.reminder_footer_reason,
    `${strings.unsubscribe_cta}: ${unsubscribeUrl}`,
  )

  return lines.join('\n')
}

const eventTitle: CSSProperties = {
  fontSize: '18px',
  color: '#333333',
  margin: '16px 0 0',
}

const detailBlock: CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '6px',
  padding: '4px 20px',
  margin: '0 0 24px',
}
